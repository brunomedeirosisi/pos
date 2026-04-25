import { query, withTransaction } from '../../../db.js';
import { resolvePagination } from '../../../utils/pagination.js';
import type { CreateSaleItemInput, ListSalesQueryDto } from '../contracts/sales-contracts.js';
import type { SaleItemRecord, SaleRecord, SaleRecordWithoutItems } from '../domain/sales-domain.js';

export type CreateSaleCommand = {
  emissionDate: Date;
  orderNumber: string | null;
  sellerId: string | null;
  customerId: string | null;
  paymentTermId: string | null;
  subtotal: number;
  discount: number;
  total: number;
  source: string | null;
  sourceKey: string | null;
  items: CreateSaleItemInput[];
};

export interface SalesRepository {
  list(filters: ListSalesQueryDto): Promise<SaleRecord[]>;
  create(command: CreateSaleCommand): Promise<SaleRecordWithoutItems & { items: SaleItemRecord[] }>;
  findById(id: string): Promise<SaleRecord | null>;
  cancel(id: string, reason: string | null): Promise<SaleRecordWithoutItems | null>;
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
           s.order_number,
           s.seller_id,
           s.customer_id,
           s.payment_term_id,
           s.subtotal,
           s.discount,
           s.total,
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
         sp.order_number,
         sp.seller_id,
         sp.customer_id,
         sp.payment_term_id,
         sp.subtotal,
         sp.discount,
         sp.total,
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
         sp.order_number,
         sp.seller_id,
         sp.customer_id,
         sp.payment_term_id,
         sp.subtotal,
         sp.discount,
         sp.total,
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

  async create(command: CreateSaleCommand): Promise<SaleRecordWithoutItems & { items: SaleItemRecord[] }> {
    return withTransaction(async (client) => {
      const { rows: saleRows } = await query<SaleRecordWithoutItems>(
        `insert into sale (
           emission_date,
           order_number,
           seller_id,
           customer_id,
           payment_term_id,
           subtotal,
           discount,
           total,
           status,
           source,
           source_key
         )
         values ($1,$2,$3,$4,$5,$6,$7,$8,'completed',$9,$10)
         returning id, emission_date, order_number, seller_id, customer_id, payment_term_id, subtotal, discount, total, status, source, source_key, cancelled_at, cancellation_reason`,
        [
          command.emissionDate,
          command.orderNumber,
          command.sellerId,
          command.customerId,
          command.paymentTermId,
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
         s.order_number,
         s.seller_id,
         s.customer_id,
         s.payment_term_id,
         s.subtotal,
         s.discount,
         s.total,
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

  async cancel(id: string, reason: string | null): Promise<SaleRecordWithoutItems | null> {
    const { rows } = await query<SaleRecordWithoutItems>(
      `update sale
       set status = 'cancelled',
           cancelled_at = now(),
           cancellation_reason = coalesce($2, cancellation_reason)
       where id = $1
         and status <> 'cancelled'
       returning id, emission_date, order_number, seller_id, customer_id, payment_term_id, subtotal, discount, total, status, source, source_key, cancelled_at, cancellation_reason`,
      [id, reason]
    );

    return rows[0] ?? null;
  }
}
