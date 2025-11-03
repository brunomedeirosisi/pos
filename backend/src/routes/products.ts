import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { notFound } from '../errors.js';
import { requirePermission } from '../middleware/auth.js';

export const router = Router();

const listQuerySchema = z.object({
  search: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1))
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const baseSchema = z.object({
  legacy_code: z
    .string()
    .trim()
    .min(1)
    .optional(),
  name: z
    .string()
    .trim()
    .min(1),
  barcode: z
    .string()
    .trim()
    .min(1)
    .optional(),
  group_id: z.string().uuid().nullable().optional(),
  reference: z
    .string()
    .trim()
    .min(1)
    .optional(),
  min_stock: z.number().nonnegative().nullable().optional(),
  price_cash: z.number().nonnegative().nullable().optional(),
  price_base: z.number().nonnegative().nullable().optional(),
});

type ProductRow = {
  id: string;
  legacy_code: string | null;
  name: string;
  barcode: string | null;
  group_id: string | null;
  reference: string | null;
  min_stock: string | number | null;
  price_cash: string | number | null;
  price_base: string | number | null;
};

function toNumeric(value: string | number | null): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapProduct(row: ProductRow) {
  return {
    ...row,
    min_stock: toNumeric(row.min_stock),
    price_cash: toNumeric(row.price_cash),
    price_base: toNumeric(row.price_base),
  };
}

router.get(
  '/',
  requirePermission('catalog:read'),
  asyncHandler(async (req, res) => {
    const { search, limit = 100 } = listQuerySchema.parse(req.query);
    const params: unknown[] = [];
    let whereClause = '';

    if (search) {
      const likeValue = `%${search}%`;
      params.push(likeValue, likeValue, likeValue);
      const nameParam = params.length - 2;
      const legacyParam = params.length - 1;
      const barcodeParam = params.length;
      whereClause = `where name ilike $${nameParam} or legacy_code ilike $${legacyParam} or coalesce(barcode, '') ilike $${barcodeParam}`;
    }

    params.push(limit);
    const limitParam = params.length;

    const { rows } = await query<ProductRow>(
      `select id, legacy_code, name, barcode, group_id, reference, min_stock, price_cash, price_base
       from product
       ${whereClause}
       order by name asc
       limit $${limitParam}`,
      params
    );
    res.json(rows.map(mapProduct));
  })
);

router.post(
  '/',
  requirePermission('catalog:write'),
  asyncHandler(async (req, res) => {
    const body = baseSchema.parse(req.body);
    const { rows } = await query<ProductRow>(
      `insert into product (legacy_code, name, barcode, group_id, reference, min_stock, price_cash, price_base)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       returning id, legacy_code, name, barcode, group_id, reference, min_stock, price_cash, price_base`,
      [
        body.legacy_code ?? null,
        body.name,
        body.barcode ?? null,
        body.group_id ?? null,
        body.reference ?? null,
        body.min_stock ?? null,
        body.price_cash ?? null,
        body.price_base ?? null,
      ]
    );
    res.status(201).json(mapProduct(rows[0]));
  })
);

router.get(
  '/:id',
  requirePermission('catalog:read'),
  asyncHandler(async (req, res) => {
    const { rows } = await query<ProductRow>(
      `select id, legacy_code, name, barcode, group_id, reference, min_stock, price_cash, price_base
       from product
       where id = $1`,
      [req.params.id]
    );
    const product = rows[0];
    if (!product) {
      throw notFound('product not found');
    }
    res.json(mapProduct(product));
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

    const { rows } = await query<ProductRow>(
      `update product
       set ${sets.join(', ')}
       where id = $${entries.length + 1}
       returning id, legacy_code, name, barcode, group_id, reference, min_stock, price_cash, price_base`,
      values
    );

    const product = rows[0];
    if (!product) {
      throw notFound('product not found');
    }

    res.json(mapProduct(product));
  })
);
