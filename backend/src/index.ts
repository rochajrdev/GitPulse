import fastify from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';
import { prisma } from './db.js';
import { syncGitHubContributions } from './sync-contributions.js';
import { syncGitHubCommits } from './sync-github.js';

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
// ROTA: Remover E-mail (Auxiliar para Dev)
// ==========================================
const deleteEmailSchema = z.object({
  email: z.string().email(),
});

server.delete('/api/v1/users/:username/emails', async (request, reply) => {
  try {
    const { username } = request.params as { username: string };
    const { email } = deleteEmailSchema.parse(request.query);

    const user = await prisma.user.findUnique({
      where: { username },
      include: { emailAliases: true },
    });
    
    if (!user) {
      reply.code(404);
      return { error: 'Usuário não encontrado' };
    }

    // Não permite excluir se for o único e-mail
    if (user.emailAliases.length <= 1) {
      reply.code(400);
      return { error: 'Não é possível remover o único e-mail cadastrado.' };
    }

    const aliasExists = user.emailAliases.some((alias: { email: string }) => alias.email.toLowerCase() === email.toLowerCase());
    if (!aliasExists) {
      reply.code(404);
      return { error: 'E-mail não está associado a este usuário.' };
    }

    // Remove o alias do banco
    await prisma.emailAlias.delete({
      where: {
        email,
      },
    });

    return { success: true, message: 'E-mail removido com sucesso!' };
  } catch (error) {
    reply.code(400);
    return { error: error instanceof Error ? error.message : 'Invalid request' };
  }
});

// ==========================================
// ROTA: Atualizar Nome do Perfil
// ==========================================
const updateProfileSchema = z.object({
  name: z.string().min(2).max(100),
});

server.put('/api/v1/users/:username', async (request, reply) => {
  try {
    const { username } = request.params as { username: string };
    const { name } = updateProfileSchema.parse(request.body);

    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      reply.code(404);
      return { error: 'Usuário não encontrado' };
    }

    // Atualiza o nome do usuário no banco
    const updatedUser = await prisma.user.update({
      where: { username },
      data: { name },
    });

    return { success: true, user: updatedUser };
  } catch (error) {
    reply.code(400);
    return { error: error instanceof Error ? error.message : 'Invalid request' };
  }
});

// ==========================================
// ROTA: Sincronizar Histórico GitHub
// ==========================================
server.post('/api/v1/users/:username/sync', async (request, reply) => {
  try {
    const { username } = request.params as { username: string };

    const user = await prisma.user.findUnique({
      where: { username },
      include: { emailAliases: true },
    });

    if (!user) {
      reply.code(404);
      return { error: 'Usuário não encontrado' };
    }

    const email = user.emailAliases[0]?.email || 'juniorbing0317@gmail.com';

    // 1. Sincroniza dados do contribution calendar via GraphQL
    let contributionStats = { grandTotal: 0, totalInserted: 0 };
    try {
      contributionStats = await syncGitHubContributions(user.username, user.name, email);
    } catch (err: any) {
      server.log.error('Erro ao sincronizar contribution calendar: ' + err.message);
    }

    // 2. Sincroniza commits individuais dos repos
    let commitStats = { totalInserted: 0, totalSkipped: 0 };
    try {
      commitStats = await syncGitHubCommits(user.username, user.name, email);
    } catch (err: any) {
      server.log.error('Erro ao sincronizar commits do GitHub: ' + err.message);
    }

    return {
      success: true,
      message: 'Sincronização com o GitHub concluída com sucesso!',
      contributionStats,
      commitStats,
    };
  } catch (error) {
    reply.code(500);
    return { error: error instanceof Error ? error.message : 'Erro interno do servidor' };
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

  // Determina o intervalo de datas
  let startOfRange: Date;
  let endOfRange: Date;
  let startDateStr: string;
  let endDateStr: string;

  const now = new Date();

  if (year === 'last-year' || !year) {
    // No último ano: últimos 365 dias
    endOfRange = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    startOfRange = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 0, 0, 0, 0);

    endDateStr = endOfRange.toISOString().split('T')[0];
    startDateStr = startOfRange.toISOString().split('T')[0];
  } else {
    const currentYear = parseInt(year);
    startOfRange = new Date(`${currentYear}-01-01T00:00:00.000Z`);
    endOfRange = new Date(`${currentYear}-12-31T23:59:59.999Z`);
    startDateStr = `${currentYear}-01-01`;
    endDateStr = `${currentYear}-12-31`;
  }

  // Busca todos os commits do período especificado
  const commits = await prisma.commit.findMany({
    where: {
      userId: user.id,
      timestamp: {
        gte: startOfRange,
        lte: endOfRange,
      },
    },
    orderBy: {
      timestamp: 'asc',
    },
  });

  // Tenta usar ContributionDay (dados exatos do GitHub) como fonte principal do heatmap
  const contributionDays = await prisma.contributionDay.findMany({
    where: {
      userId: user.id,
      source: 'github',
      date: {
        gte: startDateStr,
        lte: endDateStr,
      },
    },
    orderBy: { date: 'asc' },
  });

  // Agrupa os commits por dia (mantido para breakdown por plataforma)
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

  if (contributionDays.length > 0) {
    // ✅ MODO PRECISO: usar dados exatos do GitHub Contribution Calendar
    contributionDays.forEach((cd: any) => {
      dailyCommits[cd.date] = {
        total:     cd.count,
        github:    cd.count, // todos os dados vêm do GitHub
        gitlab:    0,
        bitbucket: 0,
        local:     0,
      };
      platformCount.github += cd.count;
    });
  } else {
    // ⚠️ FALLBACK: usar commits individuais se não houver contribution calendar
    commits.forEach((commit: any) => {
      const localDate = new Date(commit.timestamp);
      const year = localDate.getFullYear();
      const month = String(localDate.getMonth() + 1).padStart(2, '0');
      const day = String(localDate.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      if (!dailyCommits[dateStr]) {
        dailyCommits[dateStr] = { total: 0, github: 0, gitlab: 0, bitbucket: 0, local: 0 };
      }

      dailyCommits[dateStr].total++;

      const p = commit.platform.toLowerCase();
      if (p in dailyCommits[dateStr]) {
        dailyCommits[dateStr][p as keyof typeof dailyCommits[string]]++;
      } else {
        dailyCommits[dateStr].local++;
      }

      if (p in platformCount) {
        platformCount[p]++;
      } else {
        platformCount.local++;
      }
    });
  }

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

  // Busca todos os anos em que o usuário tem contribuições/commits
  const firstCommit = await prisma.commit.findFirst({
    where: { userId: user.id },
    orderBy: { timestamp: 'asc' },
    select: { timestamp: true }
  });
  
  const lastCommit = await prisma.commit.findFirst({
    where: { userId: user.id },
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true }
  });

  const firstContribution = await prisma.contributionDay.findFirst({
    where: { userId: user.id },
    orderBy: { date: 'asc' },
    select: { date: true }
  });

  const lastContribution = await prisma.contributionDay.findFirst({
    where: { userId: user.id },
    orderBy: { date: 'desc' },
    select: { date: true }
  });

  let minYear = now.getFullYear();
  let maxYear = now.getFullYear();

  if (firstCommit) {
    minYear = Math.min(minYear, new Date(firstCommit.timestamp).getFullYear());
  }
  if (lastCommit) {
    maxYear = Math.max(maxYear, new Date(lastCommit.timestamp).getFullYear());
  }
  if (firstContribution) {
    const yearVal = parseInt(firstContribution.date.split('-')[0]);
    if (!isNaN(yearVal)) minYear = Math.min(minYear, yearVal);
  }
  if (lastContribution) {
    const yearVal = parseInt(lastContribution.date.split('-')[0]);
    if (!isNaN(yearVal)) maxYear = Math.max(maxYear, yearVal);
  }

  const years: number[] = [];
  for (let y = maxYear; y >= minYear; y--) {
    years.push(y);
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
    years,
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
