import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { notFound } from '../errors.js';
import { requirePermission } from '../middleware/auth.js';
import { customerPaymentsRouter } from '../modules/customer-payments/http/customer-payments-router.js';
import { parseDecimalInput } from '../modules/customer-payments/domain/customer-payments-domain.js';
import { paginationQuerySchema, resolvePagination } from '../utils/pagination.js';

export const router = Router();

const listQuerySchema = z
  .object({
    search: z
      .string()
      .transform((value) => value.trim())
      .pipe(z.string().min(1))
      .optional(),
  })
  .merge(paginationQuerySchema);

const statusSchema = z.enum(['active', 'delinquent', 'inactive']).optional();
const customerSalesQuerySchema = paginationQuerySchema;

const numericField = z.preprocess(parseDecimalInput, z.number().nonnegative().nullable().optional());

const baseSchema = z.object({
  legacy_code: z.string().trim().min(1).optional().nullable(),
  name: z.string().trim().min(1),
  cpf: z.string().trim().min(1).optional().nullable(),
  address: z.string().trim().min(1).optional().nullable(),
  city: z.string().trim().min(1).optional().nullable(),
  uf: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase())
    .optional()
    .nullable(),
  cep: z.string().trim().min(1).optional().nullable(),
  phone: z.string().trim().min(1).optional().nullable(),
  status: statusSchema,
  credit_limit: numericField,
  notes: z.string().trim().optional().nullable(),
});

type CustomerDetailsRow = {
  id: string;
  legacy_code: string | null;
  name: string;
  cpf: string | null;
  address: string | null;
  city: string | null;
  uf: string | null;
  cep: string | null;
  phone: string | null;
  status: string;
  credit_limit: string | number | null;
  notes: string | null;
  total_charges: string | null;
  total_payments: string | null;
  last_payment_date: string | null;
};

type CustomerSaleItem = {
  id: string;
  product_id: string | null;
  product_name: string | null;
  quantity: number;
  unit_price: number | null;
  total: number | null;
};

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateOnly(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return value.toISOString().split('T')[0] ?? null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : (parsed.toISOString().split('T')[0] ?? null);
  }
  return null;
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function parseCustomerSaleItems(value: unknown): CustomerSaleItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }

    const item = entry as Record<string, unknown>;
    if (typeof item.id !== 'string') {
      return [];
    }

    return [
      {
        id: item.id,
        product_id: toNullableString(item.product_id),
        product_name: toNullableString(item.product_name),
        quantity: toNumber(item.quantity as string | number | null | undefined),
        unit_price: item.unit_price == null ? null : toNumber(item.unit_price as string | number | null | undefined),
        total: item.total == null ? null : toNumber(item.total as string | number | null | undefined),
      },
    ];
  });
}

router.get(
  '/',
  requirePermission('catalog:read'),
  asyncHandler(async (req, res) => {
    const { search, ...paginationInput } = listQuerySchema.parse(req.query);
    const pagination = resolvePagination(paginationInput, { defaultPageSize: 100, maxPageSize: 200 });

    const params: unknown[] = [];
    let whereClause = '';

    if (search) {
      const likeValue = `%${search}%`;
      params.push(likeValue, likeValue, likeValue);
      const nameParam = params.length - 2;
      const legacyParam = params.length - 1;
      const docParam = params.length;
      whereClause = `where name ilike $${nameParam} or coalesce(legacy_code, '') ilike $${legacyParam} or coalesce(cpf, '') ilike $${docParam}`;
    }

    params.push(pagination.limit);
    const limitParam = params.length;
    params.push(pagination.offset);
    const offsetParam = params.length;

    const { rows } = await query(
      `select id, legacy_code, name, cpf, address, city, uf, cep, phone, status, credit_limit, notes
       from customer
       ${whereClause}
       order by name asc
       limit $${limitParam}
       offset $${offsetParam}`,
      params
    );

    res.json(rows);
  })
);

router.post(
  '/',
  requirePermission('catalog:write'),
  asyncHandler(async (req, res) => {
    const body = baseSchema.parse(req.body);
    const { rows } = await query(
      `insert into customer (legacy_code, name, cpf, address, city, uf, cep, phone, status, credit_limit, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       returning id, legacy_code, name, cpf, address, city, uf, cep, phone, status, credit_limit, notes`,
      [
        body.legacy_code ?? null,
        body.name,
        body.cpf ?? null,
        body.address ?? null,
        body.city ?? null,
        body.uf ?? null,
        body.cep ?? null,
        body.phone ?? null,
        body.status ?? 'active',
        body.credit_limit ?? null,
        body.notes ?? null,
      ]
    );

    res.status(201).json(rows[0]);
  })
);

router.get(
  '/:id',
  requirePermission('catalog:read'),
  asyncHandler(async (req, res) => {
    const { rows } = await query<CustomerDetailsRow>(
      `select
         c.id,
         c.legacy_code,
         c.name,
         c.cpf,
         c.address,
         c.city,
         c.uf,
         c.cep,
         c.phone,
         c.status,
         c.credit_limit,
         c.notes,
         coalesce(charges.total_charges, 0) as total_charges,
         coalesce(payments.total_payments, 0) as total_payments,
         payments.last_payment_date
       from customer c
       left join lateral (
         select coalesce(sum(s.total), 0) as total_charges
         from sale s
         where s.customer_id = c.id and s.status = 'completed'
       ) as charges on true
       left join lateral (
         select coalesce(sum(p.amount), 0) as total_payments, max(p.payment_date) as last_payment_date
         from customer_payment p
         where p.customer_id = c.id
       ) as payments on true
       where c.id = $1`,
      [req.params.id]
    );

    const customer = rows[0];
    if (!customer) {
      throw notFound('customer not found');
    }

    const { total_charges, total_payments, last_payment_date, ...base } = customer;
    const charges = toNumber(total_charges);
    const payments = toNumber(total_payments);
    const balance = Number((charges - payments).toFixed(2));

    res.json({
      ...base,
      totals: {
        total_charges: charges,
        total_payments: payments,
        current_balance: balance,
        last_payment_date,
      },
    });
  })
);

router.get(
  '/:id/sales',
  requirePermission('sales:read'),
  asyncHandler(async (req, res) => {
    const pagination = resolvePagination(customerSalesQuerySchema.parse(req.query), {
      defaultPageSize: 100,
      maxPageSize: 200,
    });

    const { rowCount } = await query('select 1 from customer where id = $1', [req.params.id]);
    if (rowCount === 0) {
      throw notFound('customer not found');
    }

    const { rows } = await query<{
      id: string;
      emission_date: string | Date;
      order_number: string | null;
      total: string | number | null;
      status: string;
      seller_id: string | null;
      seller_name: string | null;
      items: unknown;
    }>(
      `select
         s.id,
         s.emission_date,
         s.order_number,
         s.total,
         s.status,
         s.seller_id,
         seller_ref.name as seller_name,
         coalesce(items_agg.items, '[]'::json) as items
       from sale s
       left join seller seller_ref on seller_ref.id = s.seller_id
       left join lateral (
         select json_agg(
           json_build_object(
             'id', si.id,
             'product_id', si.product_id,
             'product_name', p.name,
             'quantity', si.quantity,
             'unit_price', si.unit_price,
             'total', si.total
           )
           order by p.name asc nulls last, si.id asc
         ) as items
         from sale_item si
         left join product p on p.id = si.product_id
         where si.sale_id = s.id
       ) as items_agg on true
       where s.customer_id = $1 and s.status != 'draft'
       order by s.emission_date desc, s.id desc
       limit $2
       offset $3`,
      [req.params.id, pagination.limit, pagination.offset]
    );

    const formatted = rows.map((row) => ({
      id: row.id,
      emission_date: toDateOnly(row.emission_date),
      order_number: row.order_number ?? null,
      total: toNumber(row.total),
      status: row.status as 'draft' | 'completed' | 'cancelled',
      seller_id: row.seller_id ?? null,
      seller_name: row.seller_name ?? null,
      items: parseCustomerSaleItems(row.items),
    }));

    res.json(formatted);
  })
);

router.patch(
  '/:id',
  requirePermission('catalog:write'),
  asyncHandler(async (req, res) => {
    const body = baseSchema.partial().parse(req.body);
    const entries = Object.entries(body).filter(([, value]) => value !== undefined);
    if (entries.length === 0) {
      return res.status(204).send();
    }

    const sets = entries.map(([field], index) => `${field} = $${index + 1}`);
    const values = entries.map(([, value]) => value);
    values.push(req.params.id);

    const { rows } = await query(
      `update customer
       set ${sets.join(', ')}
       where id = $${entries.length + 1}
       returning id, legacy_code, name, cpf, address, city, uf, cep, phone, status, credit_limit, notes`,
      values
    );

    const customer = rows[0];
    if (!customer) {
      throw notFound('customer not found');
    }

    res.json(customer);
  })
);

router.use('/', customerPaymentsRouter);
