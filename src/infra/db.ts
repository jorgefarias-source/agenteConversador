import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL não configurada. Defina a variável de ambiente para usar o Postgres.');
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

export async function runMigrations(migrationsDir = path.resolve(process.cwd(), 'migrations')): Promise<string[]> {
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const alreadyApplied = new Set((await query<{ filename: string }>('SELECT filename FROM schema_migrations')).map((row) => row.filename));

  const applied: string[] = [];
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (alreadyApplied.has(file)) {
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await getPool().query(sql);
    await getPool().query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
    applied.push(file);
  }
  return applied;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
