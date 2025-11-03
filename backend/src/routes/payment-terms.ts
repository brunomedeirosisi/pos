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
});

router.get(
  '/',
  requirePermission('catalog:read'),
  asyncHandler(async (req, res) => {
    const { search, limit = 100 } = listQuerySchema.parse(req.query);
    const params: unknown[] = [];
    let whereClause = '';

    if (search) {
      const likeValue = `%${search}%`;
      params.push(likeValue, likeValue);
      const nameParam = params.length - 1;
      const legacyParam = params.length;
      whereClause = `where name ilike $${nameParam} or coalesce(legacy_code, '') ilike $${legacyParam}`;
    }

    params.push(limit);
    const limitParam = params.length;

    const { rows } = await query(
      `select id, legacy_code, name
       from payment_term
       ${whereClause}
       order by name asc
       limit $${limitParam}`,
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
      `insert into payment_term (legacy_code, name)
       values ($1,$2)
       returning id, legacy_code, name`,
      [body.legacy_code ?? null, body.name]
    );
    res.status(201).json(rows[0]);
  })
);

router.get(
  '/:id',
  requirePermission('catalog:read'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `select id, legacy_code, name
       from payment_term
       where id = $1`,
      [req.params.id]
    );
    const paymentTerm = rows[0];
    if (!paymentTerm) {
      throw notFound('payment term not found');
    }
    res.json(paymentTerm);
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
      `update payment_term
       set ${sets.join(', ')}
       where id = $${entries.length + 1}
       returning id, legacy_code, name`,
      values
    );
    const paymentTerm = rows[0];
    if (!paymentTerm) {
      throw notFound('payment term not found');
    }
    res.json(paymentTerm);
  })
);
