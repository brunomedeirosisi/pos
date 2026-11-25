import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { DBFFile } from 'dbffile';
import type { PoolClient } from 'pg';
import { decimalUnits } from '../../utils/checkout-decimal.js';
import { productCurrentStockSql, stockQuantitySql } from '../../utils/stock-sql.js';

export type LegacyProductStockSource = {
  sha256: string;
  records: { legacy_code: string; source_quantity: string }[];
};

export async function readLegacyProductStock(filename: string): Promise<LegacyProductStockSource> {
  const dbf = await DBFFile.open(filename, { encoding: 'latin1' });
  if (!dbf.fields.some((field) => field.name === 'ESTO_PROD'))
    throw new Error('legacy_stock_source_missing_PRODUTO_ESTO_PROD');
  if (!dbf.fields.some((field) => field.name === 'COD_PROD'))
    throw new Error('legacy_stock_source_missing_PRODUTO_COD_PROD');
  const records: LegacyProductStockSource['records'] = [];
  const seen = new Set<string>();
  for (;;) {
    const batch = await dbf.readRecords(500);
    if (!batch.length) break;
    for (const row of batch) {
      const code = String(row.COD_PROD ?? '')
        .replaceAll('\u0000', '')
        .trim();
      // Older imports preserved one unnamed record with an empty legacy code.
      // Keep that exact key rather than silently dropping its source quantity.
      if (seen.has(code)) throw new Error('legacy_stock_source_invalid_or_duplicate_product_code');
      seen.add(code);
      const quantity = row.ESTO_PROD;
      if (typeof quantity !== 'number' || !Number.isFinite(quantity))
        throw new Error('legacy_stock_source_invalid_ESTO_PROD');
      decimalUnits(Math.abs(quantity), 3);
      records.push({ legacy_code: code, source_quantity: quantity.toFixed(3) });
    }
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return { sha256: hash.digest('hex'), records };
}

export type LegacyProductStockPlanRow = {
  product_id: string;
  legacy_code: string;
  source_quantity: string;
  reconstructed_quantity: string;
  adjustment: string;
  previous_adjustment: string;
  current_stock: string;
  projected_stock: string;
};

export type LegacyProductStockSummary = {
  source: 'PRODUTO.DBF.ESTO_PROD';
  sourceSha256: string;
  products: number;
  verified: number;
  adjusted: number;
  changed: number;
};

export async function previewLegacyProductStock(
  source: LegacyProductStockSource,
  client: PoolClient,
): Promise<LegacyProductStockPlanRow[]> {
  const { rows } = await client.query<LegacyProductStockPlanRow>(
    `with input as (select * from jsonb_to_recordset($1::jsonb) as x(legacy_code text, source_quantity numeric)),
    targets as (select p.id,p.legacy_code,i.source_quantity from input i join product p on p.legacy_code=i.legacy_code),
    history as (select sm.product_id,sum(${stockQuantitySql}) as quantity
      from stock_movement sm join targets t on t.id=sm.product_id
      where sm.origin='legacy' group by sm.product_id),
    plan as (select t.*,coalesce(h.quantity,0) as reconstructed,
      coalesce(ls.adjustment,0) as previous_adjustment
      from targets t left join history h on h.product_id=t.id
      left join product_legacy_stock ls on ls.product_id=t.id)
    select plan.id as product_id,plan.legacy_code,plan.source_quantity::text,
      plan.reconstructed::text as reconstructed_quantity,
      (plan.source_quantity-plan.reconstructed)::text as adjustment,
      plan.previous_adjustment::text,${productCurrentStockSql}::text as current_stock,
      (${productCurrentStockSql}-plan.previous_adjustment+plan.source_quantity-plan.reconstructed)::text as projected_stock
    from plan join product on product.id=plan.id order by plan.legacy_code`,
    [JSON.stringify(source.records)],
  );
  if (
    rows.length !== source.records.length ||
    new Set(source.records.map((row) => row.legacy_code)).size !== rows.length
  )
    throw new Error('legacy_stock_product_coverage_mismatch');
  return rows;
}

/** Caller holds the import lock and a transaction. Operational movements remain untouched. */
export async function reconcileLegacyProductStock(
  importId: string,
  source: LegacyProductStockSource,
  client: PoolClient,
  actorId: string | null,
): Promise<LegacyProductStockSummary> {
  await client.query(
    `select p.id from product p join jsonb_to_recordset($1::jsonb) as x(legacy_code text, source_quantity numeric)
      on p.legacy_code=x.legacy_code order by p.id for no key update of p`,
    [JSON.stringify(source.records)],
  );
  const plan = await previewLegacyProductStock(source, client);
  const { rows: changed } = await client.query<{ product_id: string }>(
    `insert into product_legacy_stock(product_id,import_id,source_quantity,reconstructed_quantity,adjustment,source_sha256)
    select x.product_id,$2,x.source_quantity,x.reconstructed_quantity,x.adjustment,$3
    from jsonb_to_recordset($1::jsonb) as x(product_id uuid, source_quantity numeric, reconstructed_quantity numeric, adjustment numeric)
    on conflict(product_id) do update set import_id=excluded.import_id,source_quantity=excluded.source_quantity,
      reconstructed_quantity=excluded.reconstructed_quantity,adjustment=excluded.adjustment,
      source_sha256=excluded.source_sha256,reconciled_at=now()
    where (product_legacy_stock.import_id,product_legacy_stock.source_quantity,product_legacy_stock.reconstructed_quantity,
      product_legacy_stock.adjustment,product_legacy_stock.source_sha256) is distinct from
      (excluded.import_id,excluded.source_quantity,excluded.reconstructed_quantity,excluded.adjustment,excluded.source_sha256)
    returning product_id`,
    [JSON.stringify(plan), importId, source.sha256],
  );
  const changedIds = new Set(changed.map((row) => row.product_id));
  if (changedIds.size) {
    await client.query(
      `insert into audit_log(user_id,action,details)
      select $2,'LEGACY_PRODUCT_STOCK_RECONCILED',x || jsonb_build_object('import_id',$3::text,'source_sha256',$4::text)
      from jsonb_array_elements($1::jsonb) as x`,
      [
        JSON.stringify(plan.filter((row) => changedIds.has(row.product_id))),
        actorId,
        importId,
        source.sha256,
      ],
    );
  }
  const {
    rows: [verification],
  } = await client.query<{ products: number; verified: number; adjusted: number }>(
    `select count(*)::int as products,
      count(*) filter(where source_quantity=reconstructed_quantity+adjustment)::int as verified,
      count(*) filter(where adjustment<>0)::int as adjusted from product_legacy_stock where import_id=$1`,
    [importId],
  );
  if (
    verification.products !== source.records.length ||
    verification.verified !== source.records.length
  )
    throw new Error('legacy_stock_reconciliation_failed');
  return {
    source: 'PRODUTO.DBF.ESTO_PROD',
    sourceSha256: source.sha256,
    ...verification,
    changed: changedIds.size,
  };
}
