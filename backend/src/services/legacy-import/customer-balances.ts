import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { DBFFile } from 'dbffile';
import type { PoolClient } from 'pg';
import { decimalUnits } from '../../utils/checkout-decimal.js';

export type LegacyBalanceSource = {
  sha256: string;
  records: { legacy_code: string; source_balance: string }[];
};

export async function readLegacyCustomerBalances(filename: string): Promise<LegacyBalanceSource> {
  const dbf = await DBFFile.open(filename, { encoding: 'latin1' });
  if (!dbf.fields.some((field) => field.name === 'DEBITO'))
    throw new Error('legacy_balance_source_missing_CLIENTES_DEBITO');
  const records: LegacyBalanceSource['records'] = [];
  const seen = new Set<string>();
  for (;;) {
    const batch = await dbf.readRecords(500);
    if (!batch.length) break;
    for (const row of batch) {
      const code = String(row.CODIGO ?? '')
        .replaceAll('\u0000', '')
        .trim();
      if (!code || seen.has(code)) throw new Error('legacy_balance_source_invalid_or_duplicate_customer_code');
      seen.add(code);
      const amount = row.DEBITO;
      if (typeof amount !== 'number' || !Number.isFinite(amount))
        throw new Error('legacy_balance_source_invalid_DEBITO');
      // Reuse the exact decimal policy, including valid negative customer credit.
      decimalUnits(Math.abs(amount), 2);
      records.push({ legacy_code: code, source_balance: amount.toFixed(2) });
    }
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return { sha256: hash.digest('hex'), records };
}

export type LegacyBalancePlanRow = {
  customer_id: string;
  legacy_code: string;
  name: string;
  source_balance: string;
  reconstructed_balance: string;
  adjustment: string;
  previous_adjustment: string;
  current_balance: string;
  projected_balance: string;
};

export type LegacyBalanceSummary = {
  source: 'CLIENTES.DBF.DEBITO';
  sourceSha256: string;
  customers: number;
  adjusted: number;
  changed: number;
  verified: number;
  sourceTotal: string;
  adjustmentTotal: string;
};

export async function previewLegacyCustomerBalances(
  source: LegacyBalanceSource,
  client: PoolClient
): Promise<LegacyBalancePlanRow[]> {
  const { rows } = await client.query<LegacyBalancePlanRow>(
    `
    with input as (select * from jsonb_to_recordset($1::jsonb) as x(legacy_code text, source_balance numeric)),
    targets as (select c.id, c.legacy_code, c.name, i.source_balance from input i join customer c on c.legacy_code=i.legacy_code),
    sales as (
      select s.customer_id, sum(coalesce(s.total,0)-coalesce(s.amount_paid,0)) as net
      from sale s join targets t on t.id=s.customer_id
      where s.status='completed' and s.source in ('VENDAS','PEDIDOS') group by s.customer_id
    ), payments as (
      select p.customer_id, sum(p.amount) as paid from customer_payment p join targets t on t.id=p.customer_id
      where p.source='legacy' and p.cancelled_at is null group by p.customer_id
    ), plan as (
      select t.*, coalesce(s.net,0)-coalesce(p.paid,0) as reconstructed,
             coalesce(lb.adjustment,0) as previous_adjustment
      from targets t left join sales s on s.customer_id=t.id left join payments p on p.customer_id=t.id
      left join customer_legacy_balance lb on lb.customer_id=t.id
    )
    select plan.id as customer_id, plan.legacy_code, plan.name,
           plan.source_balance::text, plan.reconstructed::text as reconstructed_balance,
           (plan.source_balance-plan.reconstructed)::text as adjustment,
           plan.previous_adjustment::text, totals.current_balance::text,
           (totals.current_balance-plan.previous_adjustment+plan.source_balance-plan.reconstructed)::text as projected_balance
    from plan join customer_financial_totals totals on totals.customer_id=plan.id order by plan.legacy_code
  `,
    [JSON.stringify(source.records)]
  );
  if (rows.length !== source.records.length) throw new Error('legacy_balance_customer_coverage_mismatch');
  return rows;
}

/** Caller holds the import lock and a transaction. Never rewrite source sales or receipts. */
export async function reconcileLegacyCustomerBalances(
  importId: string,
  source: LegacyBalanceSource,
  client: PoolClient,
  actorId: string | null
): Promise<LegacyBalanceSummary> {
  await client.query(
    `select c.id from customer c
    join jsonb_to_recordset($1::jsonb) as x(legacy_code text, source_balance numeric) on c.legacy_code=x.legacy_code
    order by c.id for update of c`,
    [JSON.stringify(source.records)]
  );
  const plan = await previewLegacyCustomerBalances(source, client);
  const { rows: changed } = await client.query<{ customer_id: string }>(
    `
    insert into customer_legacy_balance(customer_id,import_id,source_balance,reconstructed_balance,adjustment,source_sha256)
    select x.customer_id,$2,x.source_balance,x.reconstructed_balance,x.adjustment,$3
    from jsonb_to_recordset($1::jsonb) as x(customer_id uuid, source_balance numeric, reconstructed_balance numeric, adjustment numeric)
    on conflict (customer_id) do update set import_id=excluded.import_id,source_balance=excluded.source_balance,
      reconstructed_balance=excluded.reconstructed_balance,adjustment=excluded.adjustment,
      source_sha256=excluded.source_sha256,reconciled_at=now()
    where (customer_legacy_balance.import_id,customer_legacy_balance.source_balance,customer_legacy_balance.reconstructed_balance,
      customer_legacy_balance.adjustment,customer_legacy_balance.source_sha256)
      is distinct from (excluded.import_id,excluded.source_balance,excluded.reconstructed_balance,excluded.adjustment,excluded.source_sha256)
    returning customer_id`,
    [JSON.stringify(plan), importId, source.sha256]
  );
  const changedIds = new Set(changed.map((row) => row.customer_id));
  if (changedIds.size) {
    await client.query(
      `insert into audit_log(user_id,action,details)
      select $2,'LEGACY_CUSTOMER_BALANCE_RECONCILED', x || jsonb_build_object('import_id',$3::text,'source_sha256',$4::text)
      from jsonb_array_elements($1::jsonb) as x`,
      [JSON.stringify(plan.filter((row) => changedIds.has(row.customer_id))), actorId, importId, source.sha256]
    );
  }
  const {
    rows: [verification],
  } = await client.query<{
    customers: number;
    verified: number;
    adjusted: number;
    source_total: string;
    adjustment_total: string;
  }>(
    `select count(*)::int as customers,
      count(*) filter (where lb.source_balance=lb.reconstructed_balance+lb.adjustment)::int as verified,
      count(*) filter (where lb.adjustment<>0)::int as adjusted,
      coalesce(sum(lb.source_balance),0)::text as source_total,coalesce(sum(lb.adjustment),0)::text as adjustment_total
      from customer_legacy_balance lb where lb.import_id=$1`,
    [importId]
  );
  if (verification.customers !== source.records.length || verification.verified !== source.records.length) {
    throw new Error('legacy_balance_reconciliation_failed');
  }
  return {
    source: 'CLIENTES.DBF.DEBITO',
    sourceSha256: source.sha256,
    customers: verification.customers,
    adjusted: verification.adjusted,
    changed: changedIds.size,
    verified: verification.verified,
    sourceTotal: verification.source_total,
    adjustmentTotal: verification.adjustment_total,
  };
}
