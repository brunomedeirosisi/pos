import { readFile } from 'node:fs/promises';
import { query } from '../../src/db.js';
import { runPendingMigrations } from '../../src/services/migrations.js';
export async function prepareDatabase(): Promise<void> {
  if (process.env.POSTGRES_DB !== 'pos_phase0_test' || !['127.0.0.1', 'localhost'].includes(process.env.POSTGRES_HOST ?? '')) throw new Error('Unsafe test database');
  await query(await readFile(new URL('../../sql/init.sql', import.meta.url), 'utf8'));
  await runPendingMigrations();
}
