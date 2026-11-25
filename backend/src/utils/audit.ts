import type { PoolClient } from 'pg';
import { query } from '../db.js';

type AuditInput = {
  eventId?: string;
  userId: string | null;
  action: string;
  details?: unknown;
  ipAddress?: string | null;
  client?: PoolClient;
};

export async function logAudit({
  eventId,
  userId,
  action,
  details,
  ipAddress,
  client,
}: AuditInput): Promise<void> {
  if (eventId) {
    await query(
      `insert into audit_log (id,user_id,action,details,ip_address) values ($1,$2,$3,$4::jsonb,$5)`,
      [eventId,userId,action,details ? JSON.stringify(details) : null,ipAddress ?? null], client,
    );
    return;
  }
  await query(
    `insert into audit_log (user_id, action, details, ip_address)
     values ($1, $2, $3::jsonb, $4)`,
    [userId, action, details ? JSON.stringify(details) : null, ipAddress ?? null],
    client
  );
}
