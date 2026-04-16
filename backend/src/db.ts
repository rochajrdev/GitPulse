import prismaPkg from '@prisma/client';
const { PrismaClient } = prismaPkg as any;
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'path';

// Localiza o caminho para o arquivo do banco SQLite dev.db
const dbPath = path.resolve(process.cwd(), 'dev.db');

const adapter = new PrismaBetterSqlite3({
  url: `file:${dbPath}`,
});

export const prisma = new PrismaClient({
  adapter,
});
