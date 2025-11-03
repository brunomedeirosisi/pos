import { Router } from 'express';
import { z } from 'zod';
import { notFound, badRequest, forbidden } from '../errors.js';
import { query, withTransaction } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { requirePermission } from '../middleware/auth.js';

type SaleStatus = 'draft' | 'completed' | 'cancelled';

type SaleItemRow = {
  id: string;
  product_id: string;
  quantity: string;
  unit_price: string | null;
  total: string | null;
};

type SaleRow = {
  id: string;
  emission_date: string;
  order_number: string | null;
  seller_id: string | null;
  customer_id: string | null;
  payment_term_id: string | null;
  subtotal: string | number | null;
  discount: string | number | null;
  total: string | number | null;
  status: SaleStatus;
  source: string | null;
  source_key: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  items: SaleItemRow[] | null;
};

type SaleRecordRow = Omit<SaleRow, 'items'>;
type SaleLikeRow = SaleRow | (SaleRecordRow & { items?: SaleItemRow[] | null });

export const router = Router();

function toNumeric(value: string | number | null): number | null {
  if (value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNumericOrZero(value: string | number | null): number {
  const result = toNumeric(value);
  return result ?? 0;
}

function mapSaleItem(row: SaleItemRow) {
  return {
    id: row.id,
    product_id: row.product_id,
    quantity: toNumericOrZero(row.quantity),
    unit_price: toNumeric(row.unit_price),
    total: toNumeric(row.total),
  };
}

function mapSale(row: SaleLikeRow) {
  const rawItems = ('items' in row && Array.isArray(row.items) ? row.items : []) as SaleItemRow[];
  return {
    ...row,
    subtotal: toNumeric(row.subtotal),
    discount: toNumeric(row.discount),
    total: toNumeric(row.total),
    items: rawItems.map(mapSaleItem),
  };
}

const listQuerySchema = z.object({
  from: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.coerce.date())
    .optional(),
  to: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.coerce.date())
    .optional(),
  seller_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  payment_term_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const saleItemSchema = z.object({
  product_id: z.string().uuid(),
  quantity: z.number().positive(),
  unit_price: z.number().min(0),
  total: z.number().nullable().optional(),
});

const createSaleSchema = z.object({
  emission_date: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.coerce.date())
    .optional(),
  order_number: z
    .string()
    .trim()
    .min(1)
    .optional(),
  seller_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  payment_term_id: z.string().uuid().nullable().optional(),
  subtotal: z.number().nonnegative().nullable().optional(),
  discount: z.number().min(0).nullable().optional(),
  total: z.number().nonnegative().nullable().optional(),
  source: z
    .string()
    .trim()
    .min(1)
    .optional(),
  source_key: z
    .string()
    .trim()
    .min(1)
    .optional(),
  items: z.array(saleItemSchema).min(1),
});

const cancelSaleSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1)
    .optional(),
});

type SaleItemPayload = z.infer<typeof saleItemSchema>;

function computeSaleTotals(items: SaleItemPayload[], providedSubtotal?: number | null, providedDiscount?: number | null, providedTotal?: number | null) {
  const subtotal = providedSubtotal ?? items.reduce((acc, item) => acc + item.quantity * item.unit_price, 0);
  const discount = providedDiscount ?? 0;

  if (discount > subtotal) {
    throw badRequest('discount cannot exceed subtotal');
  }

  const total = providedTotal ?? subtotal - discount;

  if (total < 0) {
    throw badRequest('total cannot be negative');
  }

  return { subtotal, discount, total };
}

function normalizeItem(item: SaleItemPayload) {
  const total = item.total ?? item.quantity * item.unit_price;
  return {
    ...item,
    total,
  };
}

router.get(
  '/',
  requirePermission('sales:read'),
  asyncHandler(async (req, res) => {
    const filters = listQuerySchema.parse(req.query);
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

    params.push(filters.limit ?? 100);
    const limitParam = params.length;

    const { rows } = await query<SaleRow>(
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
               'quantity', si.quantity,
               'unit_price', si.unit_price,
               'total', si.total
             )
           ) filter (where si.id is not null),
           '[]'
         ) as items
       from sale s
       left join sale_item si on si.sale_id = s.id
       ${whereClause}
       group by s.id
       order by s.emission_date desc, s.id desc
       limit $${limitParam}`,
      params
    );

    res.json(rows.map(mapSale));
  })
);

router.post(
  '/',
  requirePermission('pos:checkout'),
  asyncHandler(async (req, res) => {
    const payload = createSaleSchema.parse(req.body);
    const items = payload.items.map(normalizeItem);
    const { subtotal, discount, total } = computeSaleTotals(items, payload.subtotal, payload.discount, payload.total);
    const emissionDate = payload.emission_date ?? new Date();

    if (req.user && !req.user.permissions.includes('*') && discount > req.user.discountLimit) {
      throw forbidden('discount exceeds allowed limit for role');
    }

    const sale = await withTransaction<SaleRecordRow & { items: SaleItemRow[] }>(async (client) => {
      const { rows: saleRows } = await query<SaleRecordRow>(
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
          emissionDate,
          payload.order_number ?? null,
          payload.seller_id ?? null,
          payload.customer_id ?? null,
          payload.payment_term_id ?? null,
          subtotal,
          discount,
          total,
          payload.source ?? null,
          payload.source_key ?? null,
        ],
        client
      );

      const saleRecord = saleRows[0];
      const insertedItems: SaleItemRow[] = [];

      for (const item of items) {
        const { rows: itemRows } = await query<SaleItemRow>(
          `insert into sale_item (sale_id, product_id, quantity, unit_price, total)
           values ($1,$2,$3,$4,$5)
           returning id, product_id, quantity, unit_price, total`,
          [saleRecord.id, item.product_id, item.quantity, item.unit_price, item.total],
          client
        );
        insertedItems.push(itemRows[0]);
      }

      const result: SaleRecordRow & { items: SaleItemRow[] } = {
        ...saleRecord,
        items: insertedItems,
      };
      return result;
    });

    res.status(201).json(mapSale(sale));
  })
);

router.get(
  '/:id',
  requirePermission('sales:read'),
  asyncHandler(async (req, res) => {
    const { rows } = await query<SaleRow>(
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
               'quantity', si.quantity,
               'unit_price', si.unit_price,
               'total', si.total
             )
           ) filter (where si.id is not null),
           '[]'
         ) as items
       from sale s
       left join sale_item si on si.sale_id = s.id
       where s.id = $1
       group by s.id`,
      [req.params.id]
    );
    const sale = rows[0];
    if (!sale) {
      throw notFound('sale not found');
    }
    const { rows: itemRows } = await query<SaleItemRow>(
      `select id, product_id, quantity, unit_price, total from sale_item where sale_id = $1`,
      [sale.id]
    );
    res.json(mapSale({ ...sale, items: itemRows }));
  })
);

router.post(
  '/:id/cancel',
  requirePermission('sales:cancel'),
  asyncHandler(async (req, res) => {
    const payload = cancelSaleSchema.parse(req.body ?? {});
    const { rows } = await query<SaleRecordRow>(
      `update sale
       set status = 'cancelled',
           cancelled_at = now(),
           cancellation_reason = coalesce($2, cancellation_reason)
       where id = $1
         and status <> 'cancelled'
       returning id, emission_date, order_number, seller_id, customer_id, payment_term_id, subtotal, discount, total, status, source, source_key, cancelled_at, cancellation_reason`,
      [req.params.id, payload.reason ?? null]
    );
    const sale = rows[0];
    if (!sale) {
      throw notFound('sale not found');
    }
    res.json(mapSale(sale));
  })
);
