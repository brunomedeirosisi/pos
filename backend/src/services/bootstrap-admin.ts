import bcrypt from 'bcryptjs';
import { getEnv } from '../config/env.js';
import { query } from '../db.js';
import { logger } from '../observability/logger.js';

export async function ensureBootstrapAdmin(): Promise<void> {
  const env = getEnv();
  if (!env.BOOTSTRAP_ADMIN_EMAIL || !env.BOOTSTRAP_ADMIN_PASSWORD || !env.BOOTSTRAP_ADMIN_FULL_NAME) {
    return;
  }

  const email = env.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase();
  const fullName = env.BOOTSTRAP_ADMIN_FULL_NAME.trim();

  const { rows: existingUsers } = await query<{ id: string }>('select id from app_user where lower(email) = $1', [email]);
  if (existingUsers[0]) {
    logger.info({ event: 'bootstrap_admin_skipped', email }, 'Bootstrap admin already exists');
    return;
  }

  const { rows: adminRoles } = await query<{ id: string }>('select id from app_role where name = $1', ['admin']);
  const adminRole = adminRoles[0];
  if (!adminRole) {
    throw new Error('Bootstrap admin failed: admin role not found');
  }

  const passwordHash = await bcrypt.hash(env.BOOTSTRAP_ADMIN_PASSWORD, 10);
  await query(
    `insert into app_user (email, password_hash, full_name, role_id, status)
     values ($1, $2, $3, $4, 'active')`,
    [email, passwordHash, fullName, adminRole.id]
  );

  logger.warn({ event: 'bootstrap_admin_created', email }, 'Bootstrap admin created from environment configuration');
}
