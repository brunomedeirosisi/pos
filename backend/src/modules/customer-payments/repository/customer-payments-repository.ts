import type { PoolClient } from 'pg';
import { query } from '../../../db.js';
import type { PaymentListQueryDto } from '../contracts/customer-payments-contracts.js';
import { buildPaymentFilterClauses } from '../domain/customer-payments-domain.js';

export type CustomerIdentityRecord = {
  id: string;
  legacy_code: string | null;
  name: string;
  cpf: string | null;
  address: string | null;
  city: string | null;
  uf: string | null;
  cep: string | null;
  phone: string | null;
};

export type CustomerPaymentRecord = {
  id: string;
  amount: string | number;
  payment_date: string | Date | null;
  method: string | null;
  reference: string | null;
  notes: string | null;
  received_by: string | null;
  received_by_name: string | null;
  source: string;
  created_at: string | Date | null;
};

export type CustomerPaymentInsertRecord = {
  id: string;
  amount: string | number;
  payment_date: string | Date | null;
  method: string;
  reference: string | null;
  notes: string | null;
  received_by: string;
  created_at: string | Date | null;
};

export type PaginatedCustomerPaymentsResult = {
  payments: CustomerPaymentRecord[];
  filteredTotal: number;
  filteredCount: number;
};

export interface CustomerPaymentsRepository {
  customerExists(id: string, lockMode?: 'share' | 'update', client?: PoolClient): Promise<boolean>;
  getCustomerById(id: string, lockMode?: 'share' | 'update', client?: PoolClient): Promise<CustomerIdentityRecord | null>;
  getCustomerFinancialTotals(id: string, client?: PoolClient): Promise<{ totalCharges: number; totalPaid: number }>;
  listPayments(
    id: string,
    filters: PaymentListQueryDto,
    orderDirection: 'asc' | 'desc',
    pagination: { limit: number; offset: number },
    client?: PoolClient
  ): Promise<PaginatedCustomerPaymentsResult>;
  insertPayment(
    input: {
      customerId: string;
      amount: number;
      paymentDate: Date;
      method: string;
      reference: string | null;
      notes: string | null;
      receivedBy: string;
    },
    client?: PoolClient
  ): Promise<CustomerPaymentInsertRecord>;
  getPaymentById(customerId: string, paymentId: string, client?: PoolClient): Promise<CustomerPaymentRecord | null>;
  getPaidBefore(customerId: string, paymentId: string, paymentDate: Date, createdAt: Date, client?: PoolClient): Promise<number>;
}

export class PgCustomerPaymentsRepository implements CustomerPaymentsRepository {
  async customerExists(id: string, lockMode?: 'share' | 'update', client?: PoolClient): Promise<boolean> {
    const lockClause = lockMode === 'update' ? 'for update' : lockMode === 'share' ? 'for share' : '';
    const { rowCount } = await query(`select 1 from customer where id = $1 ${lockClause}`.trim(), [id], client);
    return (rowCount ?? 0) > 0;
  }

  async getCustomerById(id: string, lockMode?: 'share' | 'update', client?: PoolClient): Promise<CustomerIdentityRecord | null> {
    const lockClause = lockMode === 'update' ? 'for update' : lockMode === 'share' ? 'for share' : '';
    const { rows } = await query<CustomerIdentityRecord>(
      `select id, legacy_code, name, cpf, address, city, uf, cep, phone
       from customer
       where id = $1
       ${lockClause}`,
      [id],
      client
    );

    return rows[0] ?? null;
  }

  async getCustomerFinancialTotals(id: string, client?: PoolClient): Promise<{ totalCharges: number; totalPaid: number }> {
    const { rows } = await query<{ total_charges: string | null; total_paid: string | null }>(
      `select
         (select coalesce(sum(s.total), 0) from sale s where s.customer_id = $1 and s.status = 'completed') as total_charges,
         (select coalesce(sum(cp.amount), 0) from customer_payment cp where cp.customer_id = $1) as total_paid`,
      [id],
      client
    );

    return {
      totalCharges: Number(rows[0]?.total_charges ?? 0),
      totalPaid: Number(rows[0]?.total_paid ?? 0),
    };
  }

  async listPayments(
    id: string,
    filters: PaymentListQueryDto,
    orderDirection: 'asc' | 'desc',
    pagination: { limit: number; offset: number },
    client?: PoolClient
  ): Promise<PaginatedCustomerPaymentsResult> {
    const { whereClause, params } = buildPaymentFilterClauses(id, filters);
    params.push(pagination.limit);
    const limitParam = params.length;
    params.push(pagination.offset);
    const offsetParam = params.length;

    const { rows } = await query<
      (CustomerPaymentRecord & {
        filtered_total: string | number | null;
        filtered_count: string | number | null;
      }) | {
        id: null;
        amount: null;
        payment_date: null;
        method: null;
        reference: null;
        notes: null;
        received_by: null;
        received_by_name: null;
        source: null;
        created_at: null;
        filtered_total: string | number | null;
        filtered_count: string | number | null;
      }
    >(
      `with filtered as (
         select
           p.id,
           p.amount,
           p.payment_date,
           p.method,
           p.reference,
           p.notes,
           p.received_by,
           u.full_name as received_by_name,
           p.source,
           p.created_at
         from customer_payment p
         left join app_user u on u.id = p.received_by
         ${whereClause}
       ),
       agg as (
         select
           coalesce(sum(f.amount), 0) as filtered_total,
           count(*)::int as filtered_count
         from filtered f
       ),
       paged as (
         select *
         from filtered
         order by payment_date ${orderDirection}, created_at ${orderDirection}, id ${orderDirection}
         limit $${limitParam}
         offset $${offsetParam}
       )
       select
         paged.id,
         paged.amount,
         paged.payment_date,
         paged.method,
         paged.reference,
         paged.notes,
         paged.received_by,
         paged.received_by_name,
         paged.source,
         paged.created_at,
         agg.filtered_total,
         agg.filtered_count
       from agg
       left join paged on true
       order by paged.payment_date ${orderDirection} nulls last,
                paged.created_at ${orderDirection} nulls last,
                paged.id ${orderDirection} nulls last`,
      params,
      client
    );

    const filteredTotal = Number(rows[0]?.filtered_total ?? 0);
    const filteredCount = Number(rows[0]?.filtered_count ?? 0);

    const payments: CustomerPaymentRecord[] = rows
      .filter((row) => Boolean((row as CustomerPaymentRecord).id))
      .map((row) => row as CustomerPaymentRecord);

    return {
      payments,
      filteredTotal,
      filteredCount,
    };
  }

  async insertPayment(
    input: {
      customerId: string;
      amount: number;
      paymentDate: Date;
      method: string;
      reference: string | null;
      notes: string | null;
      receivedBy: string;
    },
    client?: PoolClient
  ): Promise<CustomerPaymentInsertRecord> {
    const { rows } = await query<CustomerPaymentInsertRecord>(
      `insert into customer_payment (
         customer_id,
         amount,
         payment_date,
         method,
         reference,
         notes,
         received_by,
         source
       )
       values ($1, $2, $3, $4, $5, $6, $7, 'manual')
       returning id, amount, payment_date, method, reference, notes, received_by, created_at`,
      [
        input.customerId,
        input.amount,
        input.paymentDate,
        input.method,
        input.reference,
        input.notes,
        input.receivedBy,
      ],
      client
    );

    return rows[0];
  }

  async getPaymentById(customerId: string, paymentId: string, client?: PoolClient): Promise<CustomerPaymentRecord | null> {
    const { rows } = await query<CustomerPaymentRecord>(
      `select
         p.id,
         p.amount,
         p.payment_date,
         p.method,
         p.reference,
         p.notes,
         p.received_by,
         u.full_name as received_by_name,
         p.source,
         p.created_at
       from customer_payment p
       left join app_user u on u.id = p.received_by
       where p.id = $1 and p.customer_id = $2`,
      [paymentId, customerId],
      client
    );

    return rows[0] ?? null;
  }

  async getPaidBefore(
    customerId: string,
    paymentId: string,
    paymentDate: Date,
    createdAt: Date,
    client?: PoolClient
  ): Promise<number> {
    const { rows } = await query<{ total: string | null }>(
      `select coalesce(sum(amount), 0) as total
       from customer_payment cp
       where cp.customer_id = $1
         and (
           cp.payment_date < $2
           or (cp.payment_date = $2 and cp.created_at < $3)
           or (cp.payment_date = $2 and cp.created_at = $3 and cp.id < $4)
         )`,
      [customerId, paymentDate, createdAt, paymentId],
      client
    );

    return Number(rows[0]?.total ?? 0);
  }
}
