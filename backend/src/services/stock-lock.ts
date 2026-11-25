import type { PoolClient } from 'pg';
import { query } from '../db.js';

/** Lock multi-product writers in a stable order; FK key-share locks remain compatible. */
export async function lockStockProducts(client: PoolClient, productIds: string[]): Promise<void> {
  if (!productIds.length) return;
  await query(
    'select id from product where id=any($1::uuid[]) order by id for no key update',
    [[...new Set(productIds)].sort()],
    client,
  );
}
