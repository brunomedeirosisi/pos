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
  findActiveSession(userId: string, sessionId: string): Promise<AuthenticatedUser | null>;
  createSession(userId: string, passwordHash: string, ttlSeconds: number): Promise<string | null>;
  revokeSession(userId: string, sessionId: string): Promise<void>;
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

  async findActiveSession(userId: string, sessionId: string): Promise<AuthenticatedUser | null> {
    const { rows } = await query<AuthUserRow>(
      `select u.id, u.email, u.password_hash, u.full_name, u.status,
              r.name as role_name, r.permissions, r.discount_limit
       from auth_session s
       join app_user u on u.id = s.user_id
       join app_role r on r.id = u.role_id
       where s.id = $2 and s.user_id = $1 and s.revoked_at is null
         and s.expires_at > now() and u.status = 'active'`, [userId, sessionId]
    );
    return rows[0] ? mapAuthenticated(rows[0]) : null;
  }

  async createSession(userId: string, passwordHash: string, ttlSeconds: number): Promise<string | null> {
    const { rows } = await query<{ id: string }>(
      `with eligible_user as (
         select id from app_user where id = $1 and password_hash = $2 and status = 'active' for update
       ), new_session as (
         insert into auth_session (user_id, expires_at)
         select id, now() + make_interval(secs => $3::int) from eligible_user
         returning id, user_id
       )
       update app_user u set last_login_at = now(), updated_at = now()
       from new_session s where u.id = s.user_id returning s.id`, [userId, passwordHash, ttlSeconds]
    );
    return rows[0]?.id ?? null;
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await query('update auth_session set revoked_at = coalesce(revoked_at, now()) where id = $2 and user_id = $1', [userId, sessionId]);
  }
}
