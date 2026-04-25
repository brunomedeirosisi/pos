import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fsp } from 'node:fs';
import { withTransaction } from '../db.js';

const MIGRATION_LOCK_KEY = 1_048_573;

function resolveMigrationsDir(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, '../../sql/migrations');
}

export async function runPendingMigrations(): Promise<string[]> {
  const migrationsDir = resolveMigrationsDir();
  const applied: string[] = [];

  let migrationFiles: string[] = [];
  try {
    const entries = await fsp.readdir(migrationsDir, { withFileTypes: true });
    migrationFiles = entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.sql'))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return applied;
    }
    throw error;
  }

  await withTransaction(async (client) => {
    await client.query('select pg_advisory_xact_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(`
      create table if not exists schema_migrations (
        filename text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `);

    const { rows } = await client.query<{ filename: string }>('select filename from schema_migrations');
    const alreadyApplied = new Set(rows.map((row) => row.filename));

    for (const file of migrationFiles) {
      if (alreadyApplied.has(file)) {
        continue;
      }

      const fullPath = path.join(migrationsDir, file);
      const sql = await fsp.readFile(fullPath, 'utf8');
      await client.query(sql);
      await client.query(
        `insert into schema_migrations (filename, checksum, applied_at) values ($1, md5($2), now())`,
        [file, sql]
      );
      applied.push(file);
    }
  });

  return applied;
}
