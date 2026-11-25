import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { notFound } from '../errors.js';
import { requirePermission } from '../middleware/auth.js';
import { paginationQuerySchema, resolvePagination } from '../utils/pagination.js';
import { generateNextNumericCode } from '../utils/generated-code.js';
import { productCurrentStockSql } from '../utils/stock-sql.js';
import { isCheckoutQuantity } from '../utils/checkout-decimal.js';
import { adjustStock, recordStockFailure, requireStockActor } from '../services/stock-adjustments.js';
import { logAudit } from '../utils/audit.js';

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

function parseDecimalInput(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed) return null;

  let normalized = trimmed.replace(/\s+/g, '');
  normalized = normalized.replace(/[^0-9.,+-]/g, '');

  const commaPos = normalized.lastIndexOf(',');
  const dotPos = normalized.lastIndexOf('.');
  if (commaPos > -1 && dotPos > -1) {
    if (commaPos > dotPos) {
      normalized = normalized.replace(/\./g, '');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  }

  normalized = normalized.replace(',', '.');
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? value : parsed;
}

const numericField = z.preprocess(parseDecimalInput, z.number().nonnegative().nullable().optional());

const writeSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1),
  barcode: z
    .string()
    .trim()
    .min(1)
    .optional()
    .nullable(),
  group_id: z.string().uuid().nullable().optional(),
  reference: z
    .string()
    .trim()
    .min(1)
    .optional()
    .nullable(),
  min_stock: numericField,
  price_cash: numericField,
  price_base: numericField,
});

const createSchema = writeSchema.extend({
  initial_stock: z.number().finite().refine((value) => value === 0 || isCheckoutQuantity(value), {
    message: 'initial_stock must be a nonnegative integer',
  }).default(0),
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
  current_stock: string | number;
  stock_version: string;
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
    current_stock: Number(row.current_stock),
  };
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
      const barcodeParam = params.length;
      whereClause = `where name ilike $${nameParam} or legacy_code ilike $${legacyParam} or coalesce(barcode, '') ilike $${barcodeParam}`;
    }

    params.push(pagination.limit);
    const limitParam = params.length;
    params.push(pagination.offset);
    const offsetParam = params.length;

    const { rows } = await query<ProductRow>(
      `select id, legacy_code, name, barcode, group_id, reference, min_stock, price_cash, price_base,
         ${productCurrentStockSql} as current_stock,stock_version::text
       from product
       ${whereClause}
       order by name asc
       limit $${limitParam}
       offset $${offsetParam}`,
      params
    );
    res.json(rows.map(mapProduct));
  })
);

router.post(
  '/',
  requirePermission('catalog:write'),
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);

    const product = await withTransaction(async (client) => {
      const stockActor = body.initial_stock > 0 ? await requireStockActor(req.user?.id, client) : null;
      const generatedCode = await generateNextNumericCode('product', client);
      const { rows } = await query<ProductRow>(
        `insert into product (legacy_code, name, barcode, group_id, reference, min_stock, price_cash, price_base)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         returning id, legacy_code, name, barcode, group_id, reference, min_stock, price_cash, price_base,
           0::numeric as current_stock,stock_version::text`,
        [
          generatedCode,
          body.name,
          body.barcode ?? null,
          body.group_id ?? null,
          body.reference ?? null,
          body.min_stock ?? null,
          body.price_cash ?? null,
          body.price_base ?? null,
        ],
        client
      );

      if (body.initial_stock > 0) {
        await query(
          `insert into stock_movement (product_id, type, quantity, origin)
           values ($1, 'entrada', $2, 'operational')`,
          [rows[0].id, body.initial_stock],
          client,
        );
        await logAudit({ userId: stockActor!.id, action: 'PRODUCT_INITIAL_STOCK', client,
          ipAddress: req.ip, details: { product_id: rows[0].id, actor: stockActor, previous_quantity: 0, new_quantity: body.initial_stock, result: 'success' } });
      }

      const version = (await query<{ stock_version: string }>('select stock_version::text from product where id=$1', [rows[0].id], client)).rows[0].stock_version;
      return { ...rows[0], current_stock: body.initial_stock, stock_version: version };
    });

    res.status(201).json(mapProduct(product));
  })
);

router.post('/:id/stock-adjustments', asyncHandler(async (req,res) => {
  try { res.status(201).json(await adjustStock(req)); }
  catch (error) { await recordStockFailure(req,error); throw error; }
}));

router.get(
  '/:id',
  requirePermission('catalog:read'),
  asyncHandler(async (req, res) => {
    const { rows } = await query<ProductRow>(
      `select id, legacy_code, name, barcode, group_id, reference, min_stock, price_cash, price_base,
         ${productCurrentStockSql} as current_stock,stock_version::text
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
    const body = writeSchema.partial().parse(req.body);
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
       returning id, legacy_code, name, barcode, group_id, reference, min_stock, price_cash, price_base,
         ${productCurrentStockSql} as current_stock,stock_version::text`,
      values
    );

    const product = rows[0];
    if (!product) {
      throw notFound('product not found');
    }

    res.json(mapProduct(product));
  })
);
