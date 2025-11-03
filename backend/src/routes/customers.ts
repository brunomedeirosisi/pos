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

const statusSchema = z.enum(['active', 'delinquent', 'inactive']).optional();

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
  cpf: z
    .string()
    .trim()
    .min(1)
    .optional(),
  address: z
    .string()
    .trim()
    .min(1)
    .optional(),
  city: z
    .string()
    .trim()
    .min(1)
    .optional(),
  uf: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase())
    .optional(),
  cep: z
    .string()
    .trim()
    .min(1)
    .optional(),
  phone: z
    .string()
    .trim()
    .min(1)
    .optional(),
  status: statusSchema,
  credit_limit: z.number().nonnegative().nullable().optional(),
  notes: z
    .string()
    .trim()
    .optional(),
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
      params.push(likeValue, likeValue, likeValue);
      const nameParam = params.length - 2;
      const legacyParam = params.length - 1;
      const docParam = params.length;
      whereClause = `where name ilike $${nameParam} or coalesce(legacy_code, '') ilike $${legacyParam} or coalesce(cpf, '') ilike $${docParam}`;
    }

    params.push(limit);
    const limitParam = params.length;

    const { rows } = await query(
      `select id, legacy_code, name, cpf, address, city, uf, cep, phone, status, credit_limit, notes
       from customer
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
    const { rows } = await query(
      `select id, legacy_code, name, cpf, address, city, uf, cep, phone, status, credit_limit, notes
       from customer
       where id = $1`,
      [req.params.id]
    );
    const customer = rows[0];
    if (!customer) {
      throw notFound('customer not found');
    }
    res.json(customer);
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
