import type { PoolClient } from 'pg';
import { query, withTransaction } from '../../../db.js';
import { conflict } from '../../../errors.js';
import { resolvePagination } from '../../../utils/pagination.js';
import type { CreateSaleItemInput, ListSalesQueryDto } from '../contracts/sales-contracts.js';
import { buildSaleStockMovements, buildCheckoutStockMovements } from '../domain/sales-domain.js';
import type {
  SaleItemRecord,
  SaleProductPricingRecord,
  SaleRecord,
  SaleRecordWithoutItems,
} from '../domain/sales-domain.js';

export type CreateSaleCommand = {
  emissionDate: Date;
  paidAt: Date | null;
  orderNumber: string | null;
  sellerId: string | null;
  customerId: string | null;
  paymentTermId: string | null;
  paymentMethod: string | null;
  amountPaid: number | null;
  changeAmount: number;
  subtotal: number;
  discount: number;
  total: number;
  pendingAmount: number;
  source: string | null;
  sourceKey: string | null;
  items: CreateSaleItemInput[];
};

export type SaleReceiptRecord = SaleRecordWithoutItems & {
  customer_legacy_code: string | null;
  customer_name: string | null;
  customer_cpf: string | null;
  payment_term_name: string | null;
  seller_name: string | null;
  items: SaleItemRecord[] | null;
};

export interface SalesRepository {
  list(filters: ListSalesQueryDto): Promise<SaleRecord[]>;
  findProductsForCheckout(productIds: string[]): Promise<SaleProductPricingRecord[]>;
  create(command: CreateSaleCommand): Promise<SaleRecordWithoutItems & { items: SaleItemRecord[] }>;
  findById(id: string): Promise<SaleRecord | null>;
  findReceiptById(id: string): Promise<SaleReceiptRecord | null>;
  cancel(id: string, reason: string | null): Promise<SaleRecordWithoutItems | null>;
}

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function insertSaleStockMovements(
  client: PoolClient,
  saleId: string,
  movementDate: string,
  movementType: 'venda' | 'entrada',
  noteNumber: string | null,
  items: CreateSaleItemInput[]
): Promise<void> {
  const movements = movementType === 'venda' ? buildCheckoutStockMovements(items) : buildSaleStockMovements(items);

  for (const movement of movements) {
    await query(
      `insert into stock_movement (product_id, sale_id, date, type, quantity, unit_value, total, note_number)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        movement.product_id,
        saleId,
        movementDate,
        movementType,
        movement.quantity,
        movement.unit_value,
        movement.total,
        noteNumber,
      ],
      client
    );
  }
}

export class PgSalesRepository implements SalesRepository {
  async list(filters: ListSalesQueryDto): Promise<SaleRecord[]> {
    const params: unknown[] = [];
    const whereParts: string[] = [];

    if (filters.from) {
      params.push(filters.from);
      whereParts.push(`s.emission_date >= $${params.length}`);
    }

    if (filters.to) {
      params.push(filters.to);
      whereParts.push(`s.emission_date <= $${params.length}`);
    }

    if (filters.seller_id) {
      params.push(filters.seller_id);
      whereParts.push(`s.seller_id = $${params.length}`);
    }

    if (filters.customer_id) {
      params.push(filters.customer_id);
      whereParts.push(`s.customer_id = $${params.length}`);
    }

    if (filters.payment_term_id) {
      params.push(filters.payment_term_id);
      whereParts.push(`s.payment_term_id = $${params.length}`);
    }

    const whereClause = whereParts.length > 0 ? `where ${whereParts.join(' and ')}` : '';
    const pagination = resolvePagination(filters, { defaultPageSize: 100, maxPageSize: 200 });

    params.push(pagination.limit);
    const limitParam = params.length;
    params.push(pagination.offset);
    const offsetParam = params.length;

    const { rows } = await query<SaleRecord>(
      `with sale_page as (
         select
           s.id,
           s.emission_date,
           s.paid_at,
           s.order_number,
           s.seller_id,
           s.customer_id,
           s.payment_term_id,
           s.payment_method,
           s.amount_paid,
           s.change_amount,
           s.subtotal,
           s.discount,
           s.total,
           greatest(coalesce(s.total, 0) - coalesce(s.amount_paid, 0), 0) as pending_amount,
           s.status,
           s.source,
           s.source_key,
           s.cancelled_at,
           s.cancellation_reason
         from sale s
         ${whereClause}
         order by s.emission_date desc, s.id desc
         limit $${limitParam}
         offset $${offsetParam}
       )
       select
         sp.id,
         sp.emission_date,
         sp.paid_at,
         sp.order_number,
         sp.seller_id,
         sp.customer_id,
         sp.payment_term_id,
         sp.payment_method,
         sp.amount_paid,
         sp.change_amount,
         sp.subtotal,
         sp.discount,
         sp.total,
         sp.pending_amount,
         sp.status,
         sp.source,
         sp.source_key,
         sp.cancelled_at,
         sp.cancellation_reason,
         coalesce(
           json_agg(
             json_build_object(
               'id', si.id,
               'product_id', si.product_id,
               'product_name', p.name,
               'quantity', si.quantity,
               'unit_price', si.unit_price,
               'total', si.total
             )
           ) filter (where si.id is not null),
           '[]'
         ) as items
       from sale_page sp
       left join sale_item si on si.sale_id = sp.id
       left join product p on p.id = si.product_id
       group by
         sp.id,
         sp.emission_date,
         sp.paid_at,
         sp.order_number,
         sp.seller_id,
         sp.customer_id,
         sp.payment_term_id,
         sp.payment_method,
         sp.amount_paid,
         sp.change_amount,
         sp.subtotal,
         sp.discount,
         sp.total,
         sp.pending_amount,
         sp.status,
         sp.source,
         sp.source_key,
         sp.cancelled_at,
         sp.cancellation_reason
       order by sp.emission_date desc, sp.id desc`,
      params
    );

    return rows;
  }

  async findProductsForCheckout(productIds: string[]): Promise<SaleProductPricingRecord[]> {
    const uniqueIds = [...new Set(productIds)];
    if (uniqueIds.length === 0) {
      return [];
    }

    const { rows } = await query<SaleProductPricingRecord>(
      `select id, name, price_cash, price_base
       from product
       where id = any($1::uuid[])`,
      [uniqueIds]
    );

    return rows;
  }

  async create(command: CreateSaleCommand): Promise<SaleRecordWithoutItems & { items: SaleItemRecord[] }> {
    return withTransaction(async (client) => {
      const { rows: saleRows } = await query<SaleRecordWithoutItems>(
        `insert into sale (
           emission_date,
           paid_at,
           order_number,
           seller_id,
           customer_id,
           payment_term_id,
           payment_method,
           amount_paid,
           change_amount,
           subtotal,
           discount,
           total,
           status,
           source,
           source_key
         )
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'completed',$13,$14)
         returning id, emission_date, paid_at, order_number, seller_id, customer_id, payment_term_id, payment_method, amount_paid, change_amount, subtotal, discount, total, status, source, source_key, cancelled_at, cancellation_reason`,
        [
          command.emissionDate,
          command.paidAt,
          command.orderNumber,
          command.sellerId,
          command.customerId,
          command.paymentTermId,
          command.paymentMethod,
          command.amountPaid,
          command.changeAmount,
          command.subtotal,
          command.discount,
          command.total,
          command.source,
          command.sourceKey,
        ],
        client
      );

      const saleRecord = saleRows[0];
      const insertedItems: SaleItemRecord[] = [];

      for (const item of command.items) {
        const { rows: itemRows } = await query<SaleItemRecord>(
          `insert into sale_item (sale_id, product_id, quantity, unit_price, total)
           values ($1,$2,$3,$4,$5)
           returning id, product_id, quantity, unit_price, total`,
          [saleRecord.id, item.product_id, item.quantity, item.unit_price, item.total],
          client
        );
        insertedItems.push(itemRows[0]);
      }

      await insertSaleStockMovements(
        client,
        saleRecord.id,
        saleRecord.emission_date,
        'venda',
        command.orderNumber ?? saleRecord.id,
        command.items
      );

      return {
        ...saleRecord,
        items: insertedItems,
      };
    });
  }

  async findById(id: string): Promise<SaleRecord | null> {
    const { rows } = await query<SaleRecord>(
      `select
         s.id,
         s.emission_date,
         s.paid_at,
         s.order_number,
         s.seller_id,
         s.customer_id,
         s.payment_term_id,
         s.payment_method,
         s.amount_paid,
         s.change_amount,
         s.subtotal,
         s.discount,
         s.total,
         greatest(coalesce(s.total, 0) - coalesce(s.amount_paid, 0), 0) as pending_amount,
         s.status,
         s.source,
         s.source_key,
         s.cancelled_at,
         s.cancellation_reason,
         coalesce(
           json_agg(
             json_build_object(
               'id', si.id,
               'product_id', si.product_id,
               'product_name', p.name,
               'quantity', si.quantity,
               'unit_price', si.unit_price,
               'total', si.total
             )
           ) filter (where si.id is not null),
           '[]'
         ) as items
       from sale s
       left join sale_item si on si.sale_id = s.id
       left join product p on p.id = si.product_id
       where s.id = $1
       group by s.id`,
      [id]
    );

    return rows[0] ?? null;
  }

  async findReceiptById(id: string): Promise<SaleReceiptRecord | null> {
    const { rows } = await query<SaleReceiptRecord>(
      `select
         s.id,
         s.emission_date,
         s.paid_at,
         s.order_number,
         s.seller_id,
         s.customer_id,
         s.payment_term_id,
         s.payment_method,
         s.amount_paid,
         s.change_amount,
         s.subtotal,
         s.discount,
         s.total,
         greatest(coalesce(s.total, 0) - coalesce(s.amount_paid, 0), 0) as pending_amount,
         s.status,
         s.source,
         s.source_key,
         s.cancelled_at,
         s.cancellation_reason,
         c.legacy_code as customer_legacy_code,
         c.name as customer_name,
         c.cpf as customer_cpf,
         sel.name as seller_name,
         pt.name as payment_term_name,
         coalesce(
           json_agg(
             json_build_object(
               'id', si.id,
               'product_id', si.product_id,
               'product_name', p.name,
               'quantity', si.quantity,
               'unit_price', si.unit_price,
               'total', si.total
             )
           ) filter (where si.id is not null),
           '[]'
         ) as items
       from sale s
       left join customer c on c.id = s.customer_id
       left join seller sel on sel.id = s.seller_id
       left join payment_term pt on pt.id = s.payment_term_id
       left join sale_item si on si.sale_id = s.id
       left join product p on p.id = si.product_id
       where s.id = $1
       group by s.id, c.id, sel.id, pt.id`,
      [id]
    );

    return rows[0] ?? null;
  }

  async cancel(id: string, reason: string | null): Promise<SaleRecordWithoutItems | null> {
    return withTransaction(async (client) => {
      const { rows: validationRows } = await query<{
        id: string;
        customer_id: string | null;
        pending_amount: string | number | null;
      }>(
        `select
           s.id,
           s.customer_id,
           greatest(coalesce(s.total, 0) - coalesce(s.amount_paid, 0), 0) as pending_amount
         from sale s
         where s.id = $1
           and s.status <> 'cancelled'
         for update`,
        [id],
        client
      );

      const validation = validationRows[0] ?? null;
      if (!validation) {
        return null;
      }

      const pendingAmount = Number(toNumber(validation.pending_amount).toFixed(2));

      if (validation.customer_id && pendingAmount > 0) {
        const { rows: balanceRows } = await query<{ current_balance: string | number | null }>(
          `select
             coalesce(
               (select sum(s.total) from sale s where s.customer_id = $1 and s.status = 'completed'),
               0
             ) -
             (
               coalesce(
                 (select sum(s.amount_paid) from sale s where s.customer_id = $1 and s.status = 'completed'),
                 0
               ) +
               coalesce(
                 (select sum(cp.amount) from customer_payment cp where cp.customer_id = $1),
                 0
               )
             ) as current_balance`,
          [validation.customer_id],
          client
        );

        const currentBalance = Number(toNumber(balanceRows[0]?.current_balance).toFixed(2));
        const projectedBalance = Number((currentBalance - pendingAmount).toFixed(2));

        if (projectedBalance < -0.009) {
          throw conflict(
            'sale cannot be cancelled because it would create a customer credit. Reverse customer payments or refund amounts first'
          );
        }
      }

      const { rows } = await query<SaleRecordWithoutItems>(
        `update sale
         set status = 'cancelled',
             cancelled_at = now(),
             cancellation_reason = coalesce($2, cancellation_reason)
         where id = $1
           and status <> 'cancelled'
         returning id, emission_date, paid_at, order_number, seller_id, customer_id, payment_term_id, payment_method, amount_paid, change_amount, subtotal, discount, total, status, source, source_key, cancelled_at, cancellation_reason`,
        [id, reason],
        client
      );

      const saleRecord = rows[0] ?? null;
      if (!saleRecord) {
        return null;
      }

      const { rows: itemRows } = await query<SaleItemRecord>(
        `select id, product_id, quantity, unit_price, total
         from sale_item
         where sale_id = $1`,
        [id],
        client
      );

      await insertSaleStockMovements(
        client,
        saleRecord.id,
        (saleRecord.cancelled_at ?? new Date().toISOString()).slice(0, 10),
        'entrada',
        saleRecord.order_number ?? saleRecord.id,
        itemRows.map((item) => ({
          product_id: item.product_id,
          quantity: Number(item.quantity),
          unit_price: item.unit_price == null ? 0 : Number(item.unit_price),
          total: item.total == null ? null : Number(item.total),
        }))
      );

      return saleRecord;
    });
  }
}
