import { prisma } from './db.js';

async function main() {
  console.log('🌱 Iniciando o seed do banco de dados...');

  // Limpa o banco de dados
  await prisma.commit.deleteMany({});
  await prisma.emailAlias.deleteMany({});
  await prisma.user.deleteMany({});

  console.log('🧹 Banco de dados limpo.');

  // Cria o usuário padrão
  const user = await prisma.user.create({
    data: {
      username: 'rochajrdev',
      name: 'Junior Rocha',
      webhookToken: 'token_rochajrdev_12345',
      emailAliases: {
        create: [
          { email: 'rochajr.dev@gmail.com' },
          { email: 'junior@company.com' },
          { email: 'junior.freelance@outlook.com' },
        ],
      },
    },
  });

  console.log(`👤 Usuário criado: ${user.username} (${user.name})`);

  // Gera commits para o ano de 2026 até hoje (18 de maio de 2026)
  const startDate = new Date('2026-01-01T00:00:00.000Z');
  const endDate = new Date('2026-05-18T23:59:59.000Z');
  
  const platforms = ['github', 'gitlab', 'bitbucket', 'local'];
  const repos = {
    github: ['rochajrdev/GitPulse', 'rochajrdev/portfolio', 'rochajrdev/awesome-tools'],
    gitlab: ['company/enterprise-dashboard', 'company/auth-service', 'company/api-gateway'],
    bitbucket: ['freelance/e-commerce-app', 'freelance/landing-page'],
    local: ['desktop/quick-scripts', 'desktop/configs'],
  };

  const emails = [
    'rochajr.dev@gmail.com',
    'junior@company.com',
    'junior.freelance@outlook.com',
  ];

  let totalCommits = 0;
  const commitData = [];

  // Percorre cada dia de 2026
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    // Determina probabilidade de ter commits no dia (ex: 75% de chance de atividade)
    const hasActivity = Math.random() < 0.75;

    if (hasActivity) {
      // Número de commits no dia (de 1 a 8 commits)
      const commitCount = Math.floor(Math.random() * 8) + 1;

      for (let i = 0; i < commitCount; i++) {
        // Escolhe uma plataforma aleatória
        const platformIndex = Math.floor(Math.random() * platforms.length);
        const platform = platforms[platformIndex];

        // Escolhe um repositório baseado na plataforma
        const platformRepos = repos[platform as keyof typeof repos];
        const repo = platformRepos[Math.floor(Math.random() * platformRepos.length)];

        // Escolhe um e-mail com base na plataforma (trabalho para gitlab, pessoal para github, etc.)
        let authorEmail = emails[0]; // pessoal
        if (platform === 'gitlab') authorEmail = emails[1]; // trabalho
        if (platform === 'bitbucket') authorEmail = emails[2]; // freelance

        // Gera uma hora aleatória para o commit
        const commitTime = new Date(currentDate);
        commitTime.setUTCHours(
          Math.floor(Math.random() * 16) + 8, // entre 08:00 e 24:00
          Math.floor(Math.random() * 60),
          Math.floor(Math.random() * 60)
        );

        // Gera um hash SHA-1 de mentira
        const hash = Math.random().toString(16).substring(2, 9) + Math.random().toString(16).substring(2, 9);

        // Gera mensagem de commit
        const messages = [
          'refactor: improve component modularity',
          'feat: add support for dynamic integration endpoints',
          'fix: resolve race condition in webhook processing',
          'docs: update installation instructions in readme',
          'style: adjust dark mode contrast for heatmap',
          'test: add unit tests for metrics helper',
          'chore: update dependencies and typescript configs',
          'feat: implement custom SVG renderer for contribution grid',
        ];
        const message = messages[Math.floor(Math.random() * messages.length)];

        commitData.push({
          hash,
          message,
          authorEmail,
          platform,
          repository: repo,
          timestamp: commitTime,
          userId: user.id,
        });

        totalCommits++;
      }
    }

    // Avança para o próximo dia
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }

  // Insere em lotes para performance
  console.log(`📦 Gerando ${totalCommits} commits fictícios espalhados por 2026...`);
  await prisma.commit.createMany({
    data: commitData,
  });

  console.log('✨ Seed completo com sucesso!');
  console.log(`✅ Usuário rochajrdev criado.`);
  console.log(`✅ ${totalCommits} commits inseridos no banco.`);
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
