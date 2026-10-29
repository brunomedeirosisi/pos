import type { PoolClient } from 'pg';
import { query } from '../../../db.js';
import type { PaymentHistoryQuery } from '../contracts/payment-history-contracts.js';
import type { CustomerPaymentRecord } from './customer-payments-repository.js';

export type PaymentHistoryRecord = CustomerPaymentRecord & { customer_id: string; customer_name: string };

const fields = `p.id, p.customer_id, c.name as customer_name, p.amount, p.payment_date,
  p.method, p.reference, p.notes, p.received_by, u.full_name as received_by_name,
  p.source, p.created_at, p.cancelled_at, p.cancelled_by,
  actor.full_name as cancelled_by_name, p.cancellation_reason`;
const joins = `from customer_payment p
  join customer c on c.id = p.customer_id
  left join app_user u on u.id = p.received_by
  left join app_user actor on actor.id = p.cancelled_by`;

export class PgPaymentHistoryRepository {
  async list(filters: PaymentHistoryQuery, pagination: { limit: number; offset: number }) {
    const params: unknown[] = [];
    const conditions: string[] = [];
    for (const [value, column, operator] of [
      [filters.from, 'p.payment_date', '>='],
      [filters.to, 'p.payment_date', '<='],
      [filters.received_by, 'p.received_by', '='],
      [filters.customer_id, 'p.customer_id', '='],
    ]) {
      if (value) {
        params.push(value);
        conditions.push(`${column} ${operator} $${params.length}`);
      }
    }
    params.push(pagination.limit, pagination.offset);
    const { rows } = await query<PaymentHistoryRecord & { total_items: number }>(
      `with filtered as (
         select ${fields} ${joins} ${conditions.length ? `where ${conditions.join(' and ')}` : ''}
       ), totals as (select count(*)::int as total_items from filtered),
       paged as (
         select * from filtered order by payment_date desc, created_at desc, id desc
         limit $${params.length - 1} offset $${params.length}
       )
       select paged.*, totals.total_items from totals left join paged on true
       order by paged.payment_date desc, paged.created_at desc, paged.id desc`,
      params
    );
    return { payments: rows.filter((row) => row.id), totalItems: rows[0]?.total_items ?? 0 };
  }

  async get(id: string, client?: PoolClient): Promise<PaymentHistoryRecord | null> {
    const { rows } = await query<PaymentHistoryRecord>(`select ${fields} ${joins} where p.id = $1`, [id], client);
    return rows[0] ?? null;
  }

  async receivers() {
    const { rows } = await query<{ id: string; full_name: string }>(
      `select distinct u.id, u.full_name from app_user u
       join customer_payment p on p.received_by = u.id order by u.full_name, u.id`
    );
    return rows;
  }

  async cancel(id: string, userId: string, reason: string | null, client: PoolClient): Promise<boolean> {
    const { rowCount } = await query(
      `update customer_payment set cancelled_at = now(), cancelled_by = $2, cancellation_reason = $3
       where id = $1 and cancelled_at is null`,
      [id, userId, reason],
      client
    );
    return Boolean(rowCount);
  }
}
