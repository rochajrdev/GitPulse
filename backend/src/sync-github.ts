import 'dotenv/config';
import { prisma } from './db.js';

const GITHUB_USERNAME = process.env.GITHUB_USERNAME || 'rochajrdev';
const USER_NAME = process.env.USER_NAME || 'Adailson';
const USER_EMAIL = process.env.USER_EMAIL || 'juniorbing0317@gmail.com';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

const headers: Record<string, string> = {
  'User-Agent': 'GitPulse-App',
  'Accept': 'application/vnd.github+json',
};
if (GITHUB_TOKEN) {
  headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
}

// Busca todas as páginas de uma URL da API do GitHub
async function fetchAllPages<T>(baseUrl: string): Promise<T[]> {
  const results: T[] = [];
  let page = 1;

  while (true) {
    const separator = baseUrl.includes('?') ? '&' : '?';
    const url = `${baseUrl}${separator}per_page=100&page=${page}`;
    try {
      const response = await fetch(url, { headers });

      if (response.status === 409) {
        // Repositório vazio
        break;
      }

      if (!response.ok) {
        if (response.status === 403) {
          const resetHeader = response.headers.get('X-RateLimit-Reset');
          const resetTime = resetHeader ? new Date(parseInt(resetHeader) * 1000).toLocaleTimeString() : 'desconhecido';
          console.warn(`   ⚠️  Rate limit da API atingido. Reset às ${resetTime}. Parando paginação.`);
        }
        break;
      }

      const data = await response.json() as T[];
      if (!Array.isArray(data) || data.length === 0) break;

      results.push(...data);

      // Se retornou menos de 100, chegamos na última página
      if (data.length < 100) break;
      page++;
    } catch (err) {
      console.warn(`   ⚠️  Erro de rede na página ${page}:`, err);
      break;
    }
  }

  return results;
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
      message: message.slice(0, 500), // limitar tamanho da mensagem
      authorEmail,
      platform: 'github',
      repository: repoName,
      timestamp,
      userId,
    },
  });
  return true;
}

async function main() {
  console.log('🔄 Iniciando sincronização COMPLETA de commits do GitHub...');
  console.log(`👤 Usuário: ${GITHUB_USERNAME} | E-mail: ${USER_EMAIL}`);
  if (GITHUB_TOKEN) {
    console.log(`🔑 Token configurado — buscando repositórios públicos E privados com histórico completo.`);
  } else {
    console.log(`⚠️  Sem token — apenas repositórios públicos, limitado a 100 commits por repo.`);
    console.log(`   → Adicione GITHUB_TOKEN no arquivo backend/.env para histórico completo.`);
  }

  // 1. Garantir usuário e e-mail no banco
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

  console.log(`\n✅ Usuário '${user.username}' pronto no banco.`);

  let totalInserted = 0;
  let totalSkipped = 0;

  // 2. Buscar todos os repositórios (públicos + privados com token)
  const reposUrl = GITHUB_TOKEN
    ? `https://api.github.com/user/repos?type=all&sort=updated`
    : `https://api.github.com/users/${GITHUB_USERNAME}/repos?type=public&sort=updated`;

  console.log(`\n📂 Buscando repositórios...`);
  const repos = await fetchAllPages<any>(reposUrl);
  console.log(`🗂️  ${repos.length} repositórios encontrados.`);

  // 3. Para cada repositório, paginar TODOS os commits do usuário
  for (const repo of repos) {
    const repoName = repo.full_name;
    const isPrivate = repo.private ? '🔒' : '🌐';
    
    // Pular repositórios forkados — eles herdam commits do repo pai e inflam a contagem
    if (repo.fork) {
      console.log(`   ↪️  ${repoName} → pulado (fork do repositório pai).`);
      continue;
    }

    process.stdout.write(`   ${isPrivate} ${repoName} → `);

    const commitsUrl = `https://api.github.com/repos/${repoName}/commits?author=${GITHUB_USERNAME}`;
    const commits = await fetchAllPages<any>(commitsUrl);

    if (commits.length === 0) {
      console.log(`sem commits do autor.`);
      continue;
    }

    let repoInserted = 0;
    for (const c of commits) {
      const hash = c.sha;
      const message = c.commit?.message || '';
      const authorEmail = c.commit?.author?.email || USER_EMAIL;
      const dateStr = c.commit?.author?.date || c.commit?.committer?.date;
      const timestamp = dateStr ? new Date(dateStr) : new Date();

      if (!hash) continue;
      
      // Pular merge commits (têm mais de 1 parent) — evita overcounting
      const parents: any[] = c.parents || [];
      if (parents.length > 1) { totalSkipped++; continue; }

      const inserted = await insertCommit(hash, message, authorEmail, repoName, timestamp, user.id);
      if (inserted) {
        repoInserted++;
        totalInserted++;
      } else {
        totalSkipped++;
      }
    }

    console.log(`${commits.length} commits encontrados → ${repoInserted} novos inseridos.`);
  }

  // 4. FASE 2: Search API — capturar commits em repos de TERCEIROS
  // Isso cobre as contribuições que o GitHub conta mas não aparecem nos seus próprios repos
  console.log(`\n🔍 Fase 2: Buscando contribuições em repositórios de terceiros via Search API...`);
  
  const currentYear = new Date().getFullYear();
  // Busca todos os anos com commits (por ano para superar o limite de 1000 da search API)
  const years = [currentYear - 1, currentYear]; // ano passado + atual
  
  for (const year of years) {
    const searchUrl = `https://api.github.com/search/commits?q=author:${GITHUB_USERNAME}+author-date:${year}-01-01..${year}-12-31&sort=author-date&order=desc`;
    const searchHeaders = { ...headers, 'Accept': 'application/vnd.github.cloak-preview+json' };
    
    let searchPage = 1;
    let yearInserted = 0;
    
    while (true) {
      try {
        const url = `${searchUrl}&per_page=100&page=${searchPage}`;
        const response = await fetch(url, { headers: searchHeaders });
        
        if (!response.ok) {
          if (response.status === 422) break; // página fora do limite
          break;
        }
        
        const data = await response.json() as any;
        const items: any[] = data.items || [];
        
        if (items.length === 0) break;
        
        for (const c of items) {
          const hash = c.sha;
          const message = c.commit?.message || '';
          const authorEmail = c.commit?.author?.email || USER_EMAIL;
          const dateStr = c.commit?.author?.date;
          const timestamp = dateStr ? new Date(dateStr) : new Date();
          const repoName = c.repository?.full_name || 'unknown/unknown';
          
          if (!hash) continue;
          
          const inserted = await insertCommit(hash, message, authorEmail, repoName, timestamp, user.id);
          if (inserted) { yearInserted++; totalInserted++; }
          else { totalSkipped++; }
        }
        
        if (items.length < 100) break;
        searchPage++;
      } catch (err) {
        break;
      }
    }
    
    console.log(`   📅 ${year}: +${yearInserted} commits de repos externos encontrados.`);
  }

  console.log(`\n🎉 Sincronização completa finalizada!`);
  console.log(`   🟩 Commits novos no banco: ${totalInserted}`);
  console.log(`   🟨 Commits já existentes (ignorados): ${totalSkipped}`);
  console.log(`   📊 Total real no seu banco agora: ${totalInserted + totalSkipped}`);
}

main()
  .catch((e) => {
    console.error('❌ Erro durante a sincronização:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
