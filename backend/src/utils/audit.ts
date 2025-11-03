import type { PoolClient } from 'pg';
import { query } from '../db.js';

type AuditInput = {
  userId: string;
  action: string;
  details?: unknown;
  ipAddress?: string | null;
  client?: PoolClient;
};

export async function logAudit({
  userId,
  action,
  details,
  ipAddress,
  client,
}: AuditInput): Promise<void> {
  await query(
    `insert into audit_log (user_id, action, details, ip_address)
     values ($1, $2, $3::jsonb, $4)`,
    [userId, action, details ? JSON.stringify(details) : null, ipAddress ?? null],
    client
  );
}
