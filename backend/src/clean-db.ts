import { prisma } from './db.js';

async function main() {
  console.log('🧹 Limpando todos os dados mockados do banco...');

  const commits = await prisma.commit.deleteMany({});
  console.log(`   ✅ ${commits.count} commits removidos.`);

  const aliases = await prisma.emailAlias.deleteMany({});
  console.log(`   ✅ ${aliases.count} aliases removidos.`);

  const users = await prisma.user.deleteMany({});
  console.log(`   ✅ ${users.count} usuários removidos.`);

  console.log('\n🧼 Banco de dados completamente limpo!');
}

main()
  .catch((e) => {
    console.error('❌ Erro:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
