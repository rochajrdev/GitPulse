import 'dotenv/config';
import { prisma } from './db.js';

const GITHUB_USERNAME = process.env.GITHUB_USERNAME || 'rochajrdev';
const USER_NAME       = process.env.USER_NAME       || 'Adailson';
const USER_EMAIL      = process.env.USER_EMAIL      || 'juniorbing0317@gmail.com';
const GITHUB_TOKEN    = process.env.GITHUB_TOKEN    || '';

if (!GITHUB_TOKEN) {
  console.error('❌ GITHUB_TOKEN não configurado no .env. A API GraphQL do GitHub exige autenticação.');
  process.exit(1);
}

// Query GraphQL do GitHub — retorna o contributionCalendar exato do perfil
const CONTRIBUTION_QUERY = `
  query($username: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $username) {
      name
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              color
            }
          }
        }
      }
    }
  }
`;

async function graphqlRequest(query: string, variables: Record<string, any>) {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'GitPulse-App',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GitHub GraphQL API error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json() as any;
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

async function main() {
  console.log('📡 Sincronizando dados EXATOS do GitHub Contribution Calendar via GraphQL...');
  console.log(`👤 Usuário: ${GITHUB_USERNAME}`);

  // Garantir usuário no banco
  const user = await prisma.user.upsert({
    where: { username: GITHUB_USERNAME },
    update: { name: USER_NAME },
    create: {
      username: GITHUB_USERNAME,
      name: USER_NAME,
      webhookToken: `token_${GITHUB_USERNAME}_${Math.random().toString(36).substring(2, 9)}`,
    },
  });

  await prisma.emailAlias.upsert({
    where: { email: USER_EMAIL },
    update: {},
    create: { email: USER_EMAIL, userId: user.id },
  });

  // Busca por ano para cobrir histórico completo (a API limita a 1 ano por request)
  const currentYear = new Date().getFullYear();
  const yearsToFetch = [currentYear - 2, currentYear - 1, currentYear];

  let totalInserted = 0;
  let totalUpdated  = 0;
  let grandTotal    = 0;

  for (const year of yearsToFetch) {
    const from = `${year}-01-01T00:00:00Z`;
    const to   = year === currentYear
      ? new Date().toISOString()
      : `${year}-12-31T23:59:59Z`;

    console.log(`\n📅 Buscando contribuições de ${year}...`);

    try {
      const data = await graphqlRequest(CONTRIBUTION_QUERY, {
        username: GITHUB_USERNAME,
        from,
        to,
      });

      const calendar = data?.user?.contributionsCollection?.contributionCalendar;
      if (!calendar) {
        console.warn(`   ⚠️  Sem dados para ${year}`);
        continue;
      }

      const yearTotal = calendar.totalContributions;
      grandTotal += yearTotal;
      console.log(`   📊 Total de contribuições em ${year}: ${yearTotal}`);

      // Limpa os registros existentes deste ano para este usuário antes de re-inserir
      await prisma.contributionDay.deleteMany({
        where: {
          userId: user.id,
          source: 'github',
          date: { startsWith: String(year) },
        },
      });

      // Insere cada dia do calendário
      const days: { date: string; count: number; source: string; userId: string }[] = [];

      for (const week of calendar.weeks) {
        for (const day of week.contributionDays) {
          if (day.contributionCount > 0) {
            days.push({
              date:   day.date, // já vem no formato YYYY-MM-DD
              count:  day.contributionCount,
              source: 'github',
              userId: user.id,
            });
          }
        }
      }

      if (days.length > 0) {
        await prisma.contributionDay.createMany({ data: days });
        totalInserted += days.length;
        console.log(`   ✅ ${days.length} dias com contribuições salvos.`);
      } else {
        console.log(`   ℹ️  Sem dias com contribuições em ${year}.`);
      }

    } catch (err) {
      console.error(`   ❌ Erro ao buscar ${year}:`, err);
    }
  }

  console.log(`\n🎉 Sincronização do contribution calendar finalizada!`);
  console.log(`   📊 Total histórico de contribuições: ${grandTotal}`);
  console.log(`   🟩 Dias com contribuições salvos: ${totalInserted}`);
}

main()
  .catch((e) => {
    console.error('❌ Erro fatal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
