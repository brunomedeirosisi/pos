import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler.js';
import { query } from '../db.js';
import { requirePermission } from '../middleware/auth.js';
import { badRequest, conflict, notFound } from '../errors.js';

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  permissions: unknown;
  discount_limit: string | null;
};

const router = Router();

function normalizeNullableString(value?: string | null) {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const baseSelect = `
  select
    id,
    name,
    description,
    permissions,
    discount_limit
  from app_role
`;

const permissionSchema = z.string().trim().min(1);

const createRoleSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(255).optional(),
  permissions: z.array(permissionSchema),
  discountLimit: z
    .number({ invalid_type_error: 'discountLimit must be a number' })
    .nonnegative()
    .max(1000)
    .optional(),
});

const updateRoleSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(255).nullable().optional(),
    permissions: z.array(permissionSchema).optional(),
    discountLimit: z
      .number({ invalid_type_error: 'discountLimit must be a number' })
      .nonnegative()
      .max(1000)
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No fields supplied for update' });

function mapRole(row: RoleRow) {
  let permissions: string[] = [];
  if (Array.isArray(row.permissions)) {
    permissions = row.permissions as string[];
  } else if (typeof row.permissions === 'string' && row.permissions.length > 0) {
    try {
      const parsed = JSON.parse(row.permissions) as unknown;
      if (Array.isArray(parsed)) {
        permissions = parsed as string[];
      }
    } catch {
      permissions = [];
    }
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    permissions: Array.isArray(permissions) ? permissions : [],
    discountLimit: row.discount_limit ? Number(row.discount_limit) : 0,
  };
}

async function ensureRoleExists(id: string) {
  const { rows } = await query<RoleRow>(`${baseSelect} where id = $1`, [id]);
  const role = rows[0];
  if (!role) {
    throw notFound('role not found');
  }
  return mapRole(role);
}

router.get(
  '/',
  requirePermission('roles:read', 'users:read'),
  asyncHandler(async (_req, res) => {
    const { rows } = await query<RoleRow>(`${baseSelect} order by lower(name) asc`);
    res.json(rows.map(mapRole));
  })
);

router.get(
  '/:id',
  requirePermission('roles:read', 'users:read'),
  asyncHandler(async (req, res) => {
    const role = await ensureRoleExists(req.params.id);
    res.json(role);
  })
);

router.post(
  '/',
  requirePermission('roles:write'),
  asyncHandler(async (req, res) => {
    const payload = createRoleSchema.parse(req.body);

    const permissionsJson = JSON.stringify(payload.permissions);

    const { rows } = await query<RoleRow>(
      `insert into app_role (name, description, permissions, discount_limit)
       values ($1, $2, $3::jsonb, $4)
       returning id, name, description, permissions, discount_limit`,
      [payload.name.trim(), normalizeNullableString(payload.description), permissionsJson, payload.discountLimit ?? 0]
    );

    const createdRow = rows[0];
    if (!createdRow) {
      throw badRequest('could not create role');
    }

    res.status(201).json(mapRole(createdRow));
  })
);

router.patch(
  '/:id',
  requirePermission('roles:write'),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const payload = updateRoleSchema.parse(req.body);

    await ensureRoleExists(id);

    const updates: string[] = [];
    const params: unknown[] = [];

    if (payload.name !== undefined) {
      updates.push(`name = $${updates.length + 1}`);
      params.push(payload.name.trim());
    }

    if (payload.description !== undefined) {
      updates.push(`description = $${updates.length + 1}`);
      params.push(normalizeNullableString(payload.description ?? null));
    }

    if (payload.permissions !== undefined) {
      updates.push(`permissions = $${updates.length + 1}::jsonb`);
      params.push(JSON.stringify(payload.permissions));
    }

    if (payload.discountLimit !== undefined) {
      updates.push(`discount_limit = $${updates.length + 1}`);
      params.push(payload.discountLimit ?? 0);
    }

    if (updates.length === 0) {
      throw badRequest('no changes provided');
    }

    const sql = `update app_role set ${updates.join(', ')} where id = $${updates.length + 1} returning *`;
    params.push(id);

    const { rows } = await query<RoleRow>(sql, params as any[]);
    const updated = rows[0];
    if (!updated) {
      throw notFound('role not found');
    }

    res.json(mapRole(updated));
  })
);

router.delete(
  '/:id',
  requirePermission('roles:write'),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    await ensureRoleExists(id);

    const { rows } = await query<{ count: string }>(
      'select count(*)::text as count from app_user where role_id = $1',
      [id]
    );
    const count = Number(rows[0]?.count ?? '0');
    if (count > 0) {
      throw conflict('role in use by existing users');
    }

    await query('delete from app_role where id = $1', [id]);
    res.status(204).send();
  })
);

export { router };
