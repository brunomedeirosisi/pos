import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { asyncHandler } from '../utils/async-handler.js';
import { query } from '../db.js';
import { requirePermission } from '../middleware/auth.js';
import { badRequest, notFound } from '../errors.js';

type UserRow = {
  id: string;
  email: string;
  full_name: string;
  status: string;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  role_id: string | null;
  role_name: string | null;
  permissions: unknown;
  discount_limit: string | null;
};

const router = Router();

const statusSchema = z.enum(['active', 'disabled']);

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().trim().min(1),
  roleId: z.string().uuid(),
  status: statusSchema.optional(),
});

const updateUserSchema = z
  .object({
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
    fullName: z.string().trim().min(1).optional(),
    roleId: z.string().uuid().optional(),
    status: statusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No fields supplied for update' });

const baseSelect = `
  select
    u.id,
    u.email,
    u.full_name,
    u.status,
    u.last_login_at,
    u.created_at,
    u.updated_at,
    u.role_id,
    r.name as role_name,
    coalesce(r.permissions, '[]'::jsonb) as permissions,
    r.discount_limit
  from app_user u
  left join app_role r on r.id = u.role_id
`;

function parsePermissions(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw as string[];
  }

  if (typeof raw === 'string' && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as string[];
      }
    } catch {
      return [];
    }
  }

  return [];
}

function mapUser(row: UserRow) {
  const permissions = parsePermissions(row.permissions);
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    status: row.status,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    role: row.role_id
      ? {
          id: row.role_id,
          name: row.role_name ?? '',
          discountLimit: row.discount_limit ? Number(row.discount_limit) : 0,
          permissions,
        }
      : null,
    permissions,
  };
}

async function ensureRoleExists(roleId: string) {
  const { rows } = await query<{ id: string }>('select id from app_role where id = $1', [roleId]);
  if (!rows[0]) {
    throw badRequest('role not found');
  }
}

async function fetchUser(id: string) {
  const { rows } = await query<UserRow>(`${baseSelect} where u.id = $1`, [id]);
  const row = rows[0];
  if (!row) {
    throw notFound('user not found');
  }
  return mapUser(row);
}

router.get(
  '/',
  requirePermission('users:read'),
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const params: string[] = [];
    let whereClause = '';

    if (search) {
      params.push(`%${search}%`);
      whereClause = `where lower(u.email) like $1 or lower(u.full_name) like $1`;
    }

    const sql = `${baseSelect} ${whereClause} order by lower(u.full_name) asc, lower(u.email) asc`;
    const { rows } = await query<UserRow>(sql, params);
    res.json(rows.map(mapUser));
  })
);

router.get(
  '/:id',
  requirePermission('users:read'),
  asyncHandler(async (req, res) => {
    const user = await fetchUser(req.params.id);
    res.json(user);
  })
);

router.post(
  '/',
  requirePermission('users:write'),
  asyncHandler(async (req, res) => {
    const payload = createUserSchema.parse(req.body);

    await ensureRoleExists(payload.roleId);

    const email = payload.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(payload.password, 10);
    const status = payload.status ?? 'active';
    const fullName = payload.fullName.trim();

    const { rows } = await query<{ id: string }>(
      `insert into app_user (email, password_hash, full_name, role_id, status)
       values ($1, $2, $3, $4, $5)
       returning id`,
      [email, passwordHash, fullName, payload.roleId, status]
    );

    const created = await fetchUser(rows[0].id);
    res.status(201).json(created);
  })
);

router.patch(
  '/:id',
  requirePermission('users:write'),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const payload = updateUserSchema.parse(req.body);

    await fetchUser(id);

    if (payload.roleId) {
      await ensureRoleExists(payload.roleId);
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (payload.email !== undefined) {
      values.push(payload.email.trim().toLowerCase());
      setClauses.push(`email = $${values.length}`);
    }

    if (payload.fullName !== undefined) {
      values.push(payload.fullName.trim());
      setClauses.push(`full_name = $${values.length}`);
    }

    if (payload.status !== undefined) {
      values.push(payload.status);
      setClauses.push(`status = $${values.length}`);
    }

    if (payload.roleId !== undefined) {
      values.push(payload.roleId);
      setClauses.push(`role_id = $${values.length}`);
    }

    if (payload.password !== undefined) {
      const hash = await bcrypt.hash(payload.password, 10);
      values.push(hash);
      setClauses.push(`password_hash = $${values.length}`);
    }

    if (setClauses.length === 0) {
      throw badRequest('no changes provided');
    }

    setClauses.push('updated_at = now()');
    values.push(id);
    const sql = `update app_user set ${setClauses.join(', ')} where id = $${values.length}`;
    await query(sql, values as any[]);

    const updated = await fetchUser(id);
    res.json(updated);
  })
);

router.delete(
  '/:id',
  requirePermission('users:write'),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    await fetchUser(id);

    await query('update app_user set status = $1, updated_at = now() where id = $2', ['disabled', id]);
    res.status(204).send();
  })
);

export { router };
