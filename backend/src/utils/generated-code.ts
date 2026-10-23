import type { PoolClient } from 'pg';
import { query } from '../db.js';

const generatedCodeConfig = {
  customer: {
    table: 'customer',
    lockKey: 41001,
  },
  product: {
    table: 'product',
    lockKey: 41002,
  },
} as const;

export type GeneratedCodeEntity = keyof typeof generatedCodeConfig;

export async function generateNextNumericCode(
  entity: GeneratedCodeEntity,
  client: PoolClient
): Promise<string> {
  const config = generatedCodeConfig[entity];

  await query('select pg_advisory_xact_lock($1)', [config.lockKey], client);

  const { rows } = await query<{ next_code: string | number }>(
    `select coalesce(max(legacy_code::bigint), 0) + 1 as next_code
     from ${config.table}
     where legacy_code ~ '^[0-9]+$'`,
    undefined,
    client
  );

  return String(rows[0]?.next_code ?? '1');
}
