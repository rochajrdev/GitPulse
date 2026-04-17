import fastify from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import { prisma } from './db.js';

const server = fastify({
  logger: true,
});

// Configura o CORS para permitir que o frontend na porta 3001 consuma a API
await server.register(cors, {
  origin: true, // Em desenvolvimento, permite todas as origens
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
});

// ==========================================
// ROTA DE SAÚDE
// ==========================================
server.get('/health', async () => {
  return { status: 'ok', service: 'GitPulse API' };
});

// ==========================================
// ROTA: Listar Usuários (Auxiliar para Dev)
// ==========================================
server.get('/api/v1/users', async () => {
  return prisma.user.findMany({
    include: {
      emailAliases: true,
    },
  });
});

// ==========================================
// ROTA: Criar Usuário (Auxiliar para Dev)
// ==========================================
const createUserSchema = z.object({
  username: z.string().min(2),
  name: z.string().min(2),
  emails: z.array(z.string().email()).optional(),
});

server.post('/api/v1/users', async (request, reply) => {
  try {
    const { username, name, emails } = createUserSchema.parse(request.body);

    // Verifica se já existe
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      reply.code(400);
      return { error: 'Username já cadastrado' };
    }

    const webhookToken = `token_${username}_${Math.random().toString(36).substring(2, 9)}`;

    const user = await prisma.user.create({
      data: {
        username,
        name,
        webhookToken,
        emailAliases: {
          create: (emails || []).map(email => ({ email })),
        },
      },
      include: {
        emailAliases: true,
      },
    });

    return user;
  } catch (error) {
    reply.code(400);
    return { error: error instanceof Error ? error.message : 'Invalid request' };
  }
});

// ==========================================
// ROTA: Adicionar E-mail (Auxiliar para Dev)
// ==========================================
const addEmailSchema = z.object({
  email: z.string().email(),
});

server.post('/api/v1/users/:username/emails', async (request, reply) => {
  try {
    const { username } = request.params as { username: string };
    const { email } = addEmailSchema.parse(request.body);

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      reply.code(404);
      return { error: 'Usuário não encontrado' };
    }

    // Cria o alias
    const alias = await prisma.emailAlias.create({
      data: {
        email,
        userId: user.id,
      },
    });

    return alias;
  } catch (error) {
    reply.code(400);
    return { error: error instanceof Error ? error.message : 'Invalid request' };
  }
});

// ==========================================
// ROTA: Webhooks de Integração (GitHub / GitLab / Simulator)
// ==========================================
server.post('/api/v1/webhooks/:token', async (request, reply) => {
  const { token } = request.params as { token: string };

  // Busca o usuário associado ao token
  const user = await prisma.user.findUnique({
    where: { webhookToken: token },
    include: { emailAliases: true },
  });

  if (!user) {
    reply.code(404);
    return { error: 'Token de Webhook inválido ou usuário inexistente.' };
  }

  const userEmails = user.emailAliases.map((alias: any) => alias.email.toLowerCase());
  const headers = request.headers;
  const body = request.body as any;

  let platform = 'unknown';
  let commitsToProcess: Array<{
    hash: string;
    message: string;
    authorEmail: string;
    timestamp: Date;
    repository: string;
  }> = [];

  // 1. Identifica o Provedor
  if (headers['x-github-event']) {
    platform = 'github';
    // Parser GitHub PushEvent
    if (body && Array.isArray(body.commits)) {
      const repoName = body.repository?.full_name || 'unknown/repo';
      commitsToProcess = body.commits.map((c: any) => ({
        hash: c.id || '',
        message: c.message || '',
        authorEmail: c.author?.email || '',
        timestamp: new Date(c.timestamp),
        repository: repoName,
      }));
    }
  } else if (headers['x-gitlab-event']) {
    platform = 'gitlab';
    // Parser GitLab Push Hook
    if (body && Array.isArray(body.commits)) {
      const repoName = body.project?.path_with_namespace || 'unknown/repo';
      commitsToProcess = body.commits.map((c: any) => ({
        hash: c.id || '',
        message: c.message || '',
        authorEmail: c.author?.email || '',
        timestamp: new Date(c.timestamp),
        repository: repoName,
      }));
    }
  } else if (body && body.simulated === true) {
    // 2. Parser para o nosso Simulador de Commits / CLI
    platform = body.platform || 'local';
    if (Array.isArray(body.commits)) {
      commitsToProcess = body.commits.map((c: any) => ({
        hash: c.hash || Math.random().toString(16).substring(2, 10),
        message: c.message || 'Simulated commit',
        authorEmail: c.authorEmail || '',
        timestamp: new Date(c.timestamp || new Date()),
        repository: c.repository || 'simulated/repo',
      }));
    }
  } else {
    // Parser fallback para Bitbucket / genérico
    if (body && body.push && body.push.changes) {
      platform = 'bitbucket';
      const repoName = body.repository?.full_name || 'unknown/repo';
      try {
        const changes = body.push.changes;
        for (const change of changes) {
          if (change.commits && Array.isArray(change.commits)) {
            for (const c of change.commits) {
              commitsToProcess.push({
                hash: c.hash || '',
                message: c.message || '',
                authorEmail: c.author?.raw || '',
                timestamp: new Date(c.date),
                repository: repoName,
              });
            }
          }
        }
      } catch (err) {
        server.log.error(err);
      }
    }
  }

  if (commitsToProcess.length === 0) {
    return {
      message: 'Webhook recebido, mas nenhum commit foi encontrado no payload.',
      importedCount: 0,
    };
  }

  // 2. Filtra os commits pelo e-mail do usuário
  const matchedCommits = commitsToProcess.filter(c => 
    userEmails.includes(c.authorEmail.toLowerCase())
  );

  if (matchedCommits.length === 0) {
    return {
      message: 'Webhook processado. Commits recebidos, mas nenhum pertencia aos e-mails cadastrados do usuário.',
      importedCount: 0,
      checkedEmails: userEmails,
    };
  }

  // 3. Salva os commits no banco de dados
  let savedCount = 0;
  for (const commit of matchedCommits) {
    // Evita duplicados verificando o hash se ele existir
    if (commit.hash) {
      const exists = await prisma.commit.findFirst({
        where: {
          hash: commit.hash,
          userId: user.id,
        },
      });
      if (exists) continue;
    }

    await prisma.commit.create({
      data: {
        hash: commit.hash,
        message: commit.message,
        authorEmail: commit.authorEmail,
        platform,
        repository: commit.repository,
        timestamp: commit.timestamp,
        userId: user.id,
      },
    });
    savedCount++;
  }

  return {
    message: 'Webhook recebido com sucesso!',
    platform,
    commitsFound: commitsToProcess.length,
    commitsMatched: matchedCommits.length,
    importedCount: savedCount,
  };
});

// ==========================================
// ROTA: Resumo de Commits e Estatísticas
// ==========================================
server.get('/api/v1/users/:username/summary', async (request, reply) => {
  const { username } = request.params as { username: string };
  const { year } = request.query as { year?: string };

  const currentYear = year ? parseInt(year) : new Date().getFullYear();

  const user = await prisma.user.findUnique({
    where: { username },
    include: {
      emailAliases: true,
    },
  });

  if (!user) {
    reply.code(404);
    return { error: 'Usuário não encontrado' };
  }

  // Busca todos os commits do ano especificado
  const startOfYear = new Date(`${currentYear}-01-01T00:00:00.000Z`);
  const endOfYear = new Date(`${currentYear}-12-31T23:59:59.999Z`);

  const commits = await prisma.commit.findMany({
    where: {
      userId: user.id,
      timestamp: {
        gte: startOfYear,
        lte: endOfYear,
      },
    },
    orderBy: {
      timestamp: 'asc',
    },
  });

  // Agrupa os commits por dia
  const dailyCommits: Record<string, {
    total: number;
    github: number;
    gitlab: number;
    bitbucket: number;
    local: number;
  }> = {};

  const platformCount: Record<string, number> = {
    github: 0,
    gitlab: 0,
    bitbucket: 0,
    local: 0,
  };

  commits.forEach((commit: any) => {
    // Formata a data em YYYY-MM-DD
    const dateStr = commit.timestamp.toISOString().split('T')[0];

    if (!dailyCommits[dateStr]) {
      dailyCommits[dateStr] = { total: 0, github: 0, gitlab: 0, bitbucket: 0, local: 0 };
    }

    dailyCommits[dateStr].total++;
    
    const p = commit.platform.toLowerCase();
    if (p in dailyCommits[dateStr]) {
      dailyCommits[dateStr][p as keyof typeof dailyCommits[string]]++;
    } else {
      dailyCommits[dateStr].local++; // fallback
    }

    if (p in platformCount) {
      platformCount[p]++;
    } else {
      platformCount.local++;
    }
  });

  // Determina a plataforma mais ativa
  let mostActivePlatform = 'Nenhum';
  let maxCommits = 0;
  Object.entries(platformCount).forEach(([platform, count]) => {
    if (count > maxCommits) {
      maxCommits = count;
      mostActivePlatform = platform;
    }
  });

  // ==========================================
  // CÁLCULO DAS SEQUÊNCIAS (STREAKS)
  // ==========================================
  
  // Extrai todas as datas ativas ordenadas
  const activeDays = Object.keys(dailyCommits).sort();
  const activeDaysSet = new Set(activeDays);

  let currentStreak = 0;
  let longestStreak = 0;

  if (activeDays.length > 0) {
    // 1. Calcula Longest Streak
    let tempStreak = 0;
    let prevDate: Date | null = null;

    activeDays.forEach(dayStr => {
      const currentDate = new Date(dayStr);

      if (prevDate === null) {
        tempStreak = 1;
      } else {
        const diffTime = Math.abs(currentDate.getTime() - prevDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          tempStreak++;
        } else if (diffDays > 1) {
          if (tempStreak > longestStreak) {
            longestStreak = tempStreak;
          }
          tempStreak = 1;
        }
      }
      prevDate = currentDate;
    });

    if (tempStreak > longestStreak) {
      longestStreak = tempStreak;
    }

    // 2. Calcula Current Streak
    // Obtém o dia de hoje (em UTC ou no fuso correto do servidor)
    const todayStr = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Se o usuário tem commits hoje ou ontem, a sequência está ativa
    let startDayStr = '';
    if (activeDaysSet.has(todayStr)) {
      startDayStr = todayStr;
    } else if (activeDaysSet.has(yesterdayStr)) {
      startDayStr = yesterdayStr;
    }

    if (startDayStr) {
      currentStreak = 1;
      let checkDate = new Date(startDayStr);

      while (true) {
        // Decrementa um dia
        checkDate.setDate(checkDate.getDate() - 1);
        const checkStr = checkDate.toISOString().split('T')[0];

        if (activeDaysSet.has(checkStr)) {
          currentStreak++;
        } else {
          break;
        }
      }
    }
  }

  const totalCommits = commits.length;
  const activeDaysCount = activeDays.length;

  return {
    user: {
      username: user.username,
      name: user.name,
      webhookToken: user.webhookToken,
      emailAliases: user.emailAliases.map((alias: any) => alias.email),
    },
    stats: {
      totalCommits,
      currentStreak,
      longestStreak,
      activeDaysCount,
      mostActivePlatform,
      platformBreakdown: platformCount,
    },
    dailyCommits,
  };
});

// ==========================================
// INICIALIZAÇÃO DO SERVIDOR
// ==========================================
const start = async () => {
  try {
    const port = 3000;
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 GitPulse backend rodando em http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
