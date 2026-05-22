import 'dotenv/config';
import { prisma } from './db.js';

const AZURE_ORGANIZATION = process.env.AZURE_ORGANIZATION || '';
const AZURE_PROJECT = process.env.AZURE_PROJECT || '';
const AZURE_PAT = process.env.AZURE_PAT || '';

const GITHUB_USERNAME = process.env.GITHUB_USERNAME || 'dev-user';
const USER_NAME = process.env.USER_NAME || 'Developer';
const USER_EMAIL = process.env.USER_EMAIL || 'dev@example.com';

// Gera o cabeçalho de autenticação utilizando Basic Auth com o PAT
const headers: Record<string, string> = {
  'Accept': 'application/json',
  'Content-Type': 'application/json',
};

if (AZURE_PAT) {
  const credentialsBase64 = Buffer.from(`:${AZURE_PAT}`).toString('base64');
  headers['Authorization'] = `Basic ${credentialsBase64}`;
}

async function insertCommit(
  hash: string,
  message: string,
  authorEmail: string,
  repoName: string,
  timestamp: Date,
  userId: string
): Promise<boolean> {
  const existing = await prisma.commit.findFirst({ where: { hash } });
  if (existing) return false;

  await prisma.commit.create({
    data: {
      hash,
      message: message.slice(0, 500),
      authorEmail: authorEmail.toLowerCase(),
      platform: 'azure',
      repository: repoName,
      timestamp,
      userId,
    },
  });
  return true;
}

export async function syncAzureCommits(
  username: string = GITHUB_USERNAME,
  name: string = USER_NAME,
  email: string = USER_EMAIL
) {
  if (!AZURE_ORGANIZATION || !AZURE_PROJECT || !AZURE_PAT) {
    console.warn('⚠️  Credenciais do Azure DevOps não configuradas. Pulando sincronização do Azure.');
    return { totalInserted: 0, totalSkipped: 0 };
  }

  console.log('🔄 Iniciando sincronização de commits do Azure DevOps...');
  console.log(`🏢 Org: ${AZURE_ORGANIZATION} | 📂 Projeto: ${AZURE_PROJECT}`);

  // 1. Garante o usuário e alias de e-mail no banco
  const user = await prisma.user.upsert({
    where: { username },
    update: { name },
    create: {
      username,
      name,
      webhookToken: `token_${username}_${Math.random().toString(36).substring(2, 9)}`,
    },
  });

  // Puxa todos os e-mails associados ao perfil do usuário
  const userAliases = await prisma.emailAlias.findMany({
    where: { userId: user.id },
  });
  const allowedEmails = new Set(
    [email.toLowerCase(), ...userAliases.map((alias: { email: string }) => alias.email.toLowerCase())]
  );

  console.log(`✅ Usuário '${user.username}' pronto no banco de dados.`);
  console.log(`📧 E-mails monitorados para commits:`, Array.from(allowedEmails));

  let totalInserted = 0;
  let totalSkipped = 0;

  try {
    // 2. Busca todos os repositórios do projeto no Azure DevOps
    const reposUrl = `https://dev.azure.com/${AZURE_ORGANIZATION}/${AZURE_PROJECT}/_apis/git/repositories?api-version=7.1`;
    const response = await fetch(reposUrl, { headers });

    if (!response.ok) {
      throw new Error(`Falha ao buscar repositórios do Azure (HTTP ${response.status})`);
    }

    const reposData = (await response.json()) as { value: any[] };
    const repos = reposData.value || [];
    console.log(`🗂️  ${repos.length} repositórios encontrados no projeto do Azure.`);

    // Data de início para puxar os commits (início do ano anterior para abranger o calendário do heatmap)
    const currentYear = new Date().getFullYear();
    const fromDateStr = `${currentYear - 1}-01-01T00:00:00Z`;

    // 3. Para cada repositório, buscar commits do usuário
    for (const repo of repos) {
      const repoName = `${AZURE_ORGANIZATION}/${repo.name}`;
      process.stdout.write(`   🔷 ${repoName} → `);

      const commitsUrl = `https://dev.azure.com/${AZURE_ORGANIZATION}/${AZURE_PROJECT}/_apis/git/repositories/${repo.id}/commits?searchCriteria.fromDate=${fromDateStr}&api-version=7.1`;
      const commitsResponse = await fetch(commitsUrl, { headers });

      if (!commitsResponse.ok) {
        console.log(`erro ao buscar commits (HTTP ${commitsResponse.status}).`);
        continue;
      }

      const commitsData = (await commitsResponse.json()) as { value: any[] };
      const commits = commitsData.value || [];

      if (commits.length === 0) {
        console.log(`sem commits.`);
        continue;
      }

      let repoInserted = 0;
      let matchedCommits = 0;

      for (const c of commits) {
        const hash = c.commitId;
        const message = c.comment || '';
        const authorEmail = c.author?.email || '';
        const dateStr = c.author?.date;
        const timestamp = dateStr ? new Date(dateStr) : new Date();

        if (!hash || !authorEmail) continue;

        // Filtra apenas commits pertencentes a e-mails vinculados a este perfil
        if (!allowedEmails.has(authorEmail.toLowerCase())) {
          continue;
        }

        matchedCommits++;

        // Descarta commits de merge (commits com múltiplos parents no Azure)
        // A API de commits do Azure expõe a contagem ou array de parentCommitIds
        const parents: any[] = c.changeCounts || []; 
        // No Azure, commits de mesclagem geralmente possuem múltiplos parentCommitIds. 
        // Se houver mais de 1 parent, nós os pulamos para manter igual ao GitHub.
        if (c.parentCommitIds && c.parentCommitIds.length > 1) {
          totalSkipped++;
          continue;
        }

        const inserted = await insertCommit(hash, message, authorEmail, repoName, timestamp, user.id);
        if (inserted) {
          repoInserted++;
          totalInserted++;
        } else {
          totalSkipped++;
        }
      }

      console.log(`${matchedCommits} commits do autor encontrados → ${repoInserted} novos inseridos.`);
    }

    console.log(`\n🎉 Sincronização completa do Azure DevOps finalizada!`);
    console.log(`   🟩 Commits novos no banco: ${totalInserted}`);
    console.log(`   🟨 Commits já existentes (ignorados): ${totalSkipped}`);

  } catch (error) {
    console.error(`❌ Erro durante sincronização com o Azure DevOps:`, error);
  }

  return { totalInserted, totalSkipped };
}

// Execução direta (CLI)
if (process.argv[1]?.endsWith('sync-azure.ts') || process.argv[1]?.endsWith('sync-azure.js')) {
  syncAzureCommits()
    .catch((e) => {
      console.error('❌ Erro durante a sincronização:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
