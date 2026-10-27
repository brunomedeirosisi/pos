import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { query, withTransaction } from '../../db.js';
import { getEnv } from '../../config/env.js';
import { badRequest, conflict, forbidden, HttpError } from '../../errors.js';
import { logAudit } from '../../utils/audit.js';
import { validAgentToken } from './print-jobs.js';

export const printerIdSchema = z.union([z.literal('principal'), z.string().uuid()]);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
type PrinterRow = { id: string; display_name: string; enabled: boolean; agent_token_sha256: string | null };

export async function authenticatePrinter(id: string, token: unknown): Promise<boolean> {
  const printer = (await query<PrinterRow>('select * from print_printer where id=$1 and enabled=true', [id])).rows[0];
  const hash = id === 'principal' ? getEnv().PRINT_AGENT_TOKEN_SHA256 : printer?.agent_token_sha256 ?? undefined;
  return Boolean(printer && validAgentToken(token, hash));
}

export async function listPrinters() {
  const env = getEnv();
  if (env.PRINT_MODE !== 'queue') return { mode: env.PRINT_MODE, store_id: env.STORE_ID ?? null, printers: [] };
  const { rows } = await query(
    `select p.id,p.display_name,p.enabled,p.created_at,p.revoked_at,s.last_seen_at,
      coalesce(s.last_seen_at>now()-interval '30 seconds',false) as online
     from print_printer p left join print_agent_state s on s.printer_id=p.id order by p.created_at,p.id`);
  return { mode: env.PRINT_MODE, store_id: env.STORE_ID ?? null, printers: rows };
}

export async function createEnrollment(displayName: string, userId: string) {
  if (getEnv().PRINT_MODE !== 'queue' || !getEnv().STORE_ID) throw new HttpError(503, 'print_queue_not_configured');
  const code = randomBytes(24).toString('hex');
  const id = randomUUID();
  return withTransaction(async client => {
    await query("select pg_advisory_xact_lock(hashtext('pos-print-enrollment'))", [], client);
    await query('delete from print_enrollment where expires_at<now() and consumed_at is null', [], client);
    const count = (await query<{ n: number }>("select count(*)::int n from print_enrollment where consumed_at is null", [], client)).rows[0].n;
    if (count >= 20) throw conflict('too_many_pending_print_enrollments');
    const { rows } = await query<{ expires_at: Date }>(
      'insert into print_enrollment(code_sha256,printer_id,display_name) values($1,$2,$3) returning expires_at', [digest(code), id, displayName], client);
    await logAudit({ userId, action: 'print_printer.enrollment_created', details: { printer_id: id, display_name: displayName }, client });
    return { code, printer_id: id, expires_at: rows[0].expires_at.toISOString(), store_id: getEnv().STORE_ID };
  });
}

export async function redeemEnrollment(code: string, token: string) {
  if (getEnv().PRINT_MODE !== 'queue' || !getEnv().STORE_ID) throw new HttpError(503, 'print_queue_not_configured');
  return withTransaction(async client => {
    const enrollment = (await query<{ printer_id: string; display_name: string; consumed_at: Date | null; expired: boolean }>(
      'select *,expires_at<now() as expired from print_enrollment where code_sha256=$1 for update', [digest(code)], client)).rows[0];
    if (!enrollment) throw forbidden('print_pairing_invalid_or_expired');
    if (enrollment.consumed_at) {
      const existing = (await query<PrinterRow>('select * from print_printer where id=$1 for share', [enrollment.printer_id], client)).rows[0];
      // A lost HTTP reply may be retried with the same locally protected credential.
      if (!existing?.enabled || !validAgentToken(token, existing.agent_token_sha256 ?? undefined)) throw forbidden('print_pairing_already_used');
    } else {
      if (enrollment.expired) throw forbidden('print_pairing_invalid_or_expired');
      await query('insert into print_printer(id,display_name,agent_token_sha256) values($1,$2,$3)', [enrollment.printer_id, enrollment.display_name, digest(token)], client);
      await query('update print_enrollment set consumed_at=now() where code_sha256=$1', [digest(code)], client);
      await logAudit({ userId: null, action: 'print_printer.paired', details: { printer_id: enrollment.printer_id }, client });
    }
    return { printer_id: enrollment.printer_id, display_name: enrollment.display_name, store_id: getEnv().STORE_ID };
  });
}

export async function revokePrinter(id: string, userId: string): Promise<void> {
  if (id === 'principal') throw badRequest('principal_printer_cannot_be_revoked_here');
  await withTransaction(async client => {
    const result = await query('update print_printer set enabled=false,agent_token_sha256=null,revoked_at=coalesce(revoked_at,now()) where id=$1 returning id', [id], client);
    if (!result.rows.length) throw badRequest('print_printer_not_found');
    await logAudit({ userId, action: 'print_printer.revoked', details: { printer_id: id }, client });
  });
}
