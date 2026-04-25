import { query } from '../../../db.js';
import type { AuthenticatedUser, AuthUserCredentials } from '../domain/auth-types.js';

type AuthUserRow = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  status: string;
  role_name: string;
  permissions: string[];
  discount_limit: string | null;
};

function toPermissions(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function mapUser(row: AuthUserRow): AuthUserCredentials {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role_name,
    permissions: toPermissions(row.permissions),
    discountLimit: row.discount_limit ? Number(row.discount_limit) : 0,
    passwordHash: row.password_hash,
    status: row.status,
  };
}

function mapAuthenticated(row: AuthUserRow): AuthenticatedUser {
  const user = mapUser(row);
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    permissions: user.permissions,
    discountLimit: user.discountLimit,
  };
}

export interface AuthRepository {
  findByEmail(email: string): Promise<AuthUserCredentials | null>;
  findActiveById(id: string): Promise<AuthenticatedUser | null>;
  updateLastLogin(id: string): Promise<void>;
}

export class PgAuthRepository implements AuthRepository {
  async findByEmail(email: string): Promise<AuthUserCredentials | null> {
    const { rows } = await query<AuthUserRow>(
      `select
         u.id,
         u.email,
         u.password_hash,
         u.full_name,
         u.status,
         r.name as role_name,
         coalesce(r.permissions, '[]'::jsonb) as permissions,
         r.discount_limit
       from app_user u
       join app_role r on r.id = u.role_id
       where lower(u.email) = $1`,
      [email.toLowerCase()]
    );

    const record = rows[0];
    return record ? mapUser(record) : null;
  }

  async findActiveById(id: string): Promise<AuthenticatedUser | null> {
    const { rows } = await query<AuthUserRow>(
      `select
         u.id,
         u.email,
         u.password_hash,
         u.full_name,
         u.status,
         r.name as role_name,
         coalesce(r.permissions, '[]'::jsonb) as permissions,
         r.discount_limit
       from app_user u
       join app_role r on r.id = u.role_id
       where u.id = $1`,
      [id]
    );

    const record = rows[0];
    if (!record || record.status !== 'active') {
      return null;
    }

    return mapAuthenticated(record);
  }

  async updateLastLogin(id: string): Promise<void> {
    await query('update app_user set last_login_at = now(), updated_at = now() where id = $1', [id]);
  }
}