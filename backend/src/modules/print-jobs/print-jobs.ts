import { createHash, timingSafeEqual } from 'node:crypto';
import { query, withTransaction } from '../../db.js';
import { badRequest, conflict, notFound, HttpError } from '../../errors.js';
import { getEnv } from '../../config/env.js';
import type { SaleReceiptDto, SaleReceiptLocale } from '../sales/contracts/sales-contracts.js';

export type PrintStatus = 'queued' | 'claimed' | 'spooling' | 'submitted' | 'failed' | 'uncertain';
export type PrintDelivery = { job_id: string; status: PrintStatus; requested_at: string; printer_id: string; printer_name: string };
type Job = {
  id: string; printer_id: string; printer_name: string; request_id: string; sale_id: string; copies: number; locale: string;
  receipt_code: string; content: string; status: PrintStatus; claim_token: string | null;
  requested_at: Date; started_at: Date | null; finished_at: Date | null; result_code: string | null;
};
const metadata = (job: Job) => ({
  job_id: job.id, printer_id: job.printer_id, printer_name: job.printer_name, sale_id: job.sale_id, status: job.status, copies: job.copies,
  receipt_code: job.receipt_code, requested_at: job.requested_at.toISOString(),
  started_at: job.started_at?.toISOString() ?? null, finished_at: job.finished_at?.toISOString() ?? null,
  result_code: job.result_code,
});

export function validAgentToken(token: unknown, expectedHash: string | undefined): boolean {
  if (typeof token !== 'string' || token.length < 32 || token.length > 256 || !expectedHash) return false;
  const actual = createHash('sha256').update(token).digest();
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function expireLeases(): Promise<void> {
  await query(`update print_job set status='uncertain',finished_at=now(),result_code='agent_lease_expired'
    where status='spooling' and lease_until<now()`);
  // Nothing may reach the spooler until /start has been acknowledged.
  await query(`update print_job set status='queued',claim_token=null,lease_until=null
    where status='claimed' and lease_until<now()`);
}

export async function enqueuePrint(input: { requestId: string; receipt: SaleReceiptDto; copies: number; locale: SaleReceiptLocale; printerId?: string }): Promise<PrintDelivery> {
  if (!input.receipt.plain_text.trim() || Buffer.byteLength(input.receipt.plain_text, 'utf8') > 1048576) throw badRequest('print_receipt_size_invalid');
  const printerId = input.printerId ?? 'principal';
  return withTransaction(async (client) => {
    await query('select pg_advisory_xact_lock(hashtext($1))', ['pos-printer-' + printerId], client);
    const existing = (await query<Job>('select * from print_job where request_id=$1', [input.requestId], client)).rows[0];
    const matches = (job: Job) => job.sale_id === input.receipt.sale.id && job.copies === input.copies && job.locale === input.locale && job.printer_id === printerId;
    const delivery = (job: Job): PrintDelivery => ({ job_id: job.id, status: job.status, requested_at: job.requested_at.toISOString(), printer_id: job.printer_id, printer_name: job.printer_name });
    if (existing) {
      if (!matches(existing)) throw conflict('print_request_id_reused_with_different_parameters');
      return delivery(existing);
    }
    // Hold the printer row through enqueue so revocation cannot race an accepted new request.
    const printer = (await query<{ display_name: string }>('select display_name from print_printer where id=$1 and enabled=true for share', [printerId], client)).rows[0];
    if (!printer) throw badRequest('print_printer_disabled_or_unknown');
    const count = (await query<{ count: number }>("select count(*)::int as count from print_job where printer_id=$1 and status in ('queued','claimed','spooling')", [printerId], client)).rows[0].count;
    if (count >= getEnv().PRINT_QUEUE_MAX_PENDING) throw new HttpError(503, 'print_queue_full');
    await query(`insert into print_job(request_id,sale_id,copies,locale,receipt_code,content,printer_id,printer_name)
      values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(request_id) do nothing`,
      [input.requestId, input.receipt.sale.id, input.copies, input.locale, input.receipt.sale.code, input.receipt.plain_text, printerId, printer.display_name], client);
    const job = (await query<Job>('select * from print_job where request_id=$1', [input.requestId], client)).rows[0];
    if (!matches(job)) throw conflict('print_request_id_reused_with_different_parameters');
    return delivery(job);
  });
}

export async function claimPrint(leaseSeconds: number, printerId = 'principal') {
  await expireLeases();
  return withTransaction(async (client) => {
    await query('select pg_advisory_xact_lock(hashtext($1))', ['pos-printer-' + printerId], client);
    await query("insert into print_agent_state(printer_id) values($1) on conflict(printer_id) do update set last_seen_at=now()", [printerId], client);
    const busy = await query("select 1 from print_job where printer_id=$1 and status in ('claimed','spooling') limit 1", [printerId], client);
    if (busy.rows.length) return null;
    const { rows } = await query<Job>(`update print_job set status='claimed',claim_token=gen_random_uuid(),lease_until=now()+make_interval(secs=>$1)
      where id=(select id from print_job where printer_id=$2 and status='queued' order by requested_at,id for update skip locked limit 1)
      returning *`, [leaseSeconds, printerId], client);
    const job = rows[0];
    return job ? { ...metadata(job), claim_token: job.claim_token, content: job.content, locale: job.locale } : null;
  });
}

export async function startPrint(id: string, token: string, printerId = 'principal'): Promise<void> {
  const result = await query(`update print_job set status='spooling',started_at=coalesce(started_at,now())
    where id=$1 and claim_token=$2 and printer_id=$3 and status in ('claimed','spooling') and lease_until>now() returning id`, [id, token, printerId]);
  if (!result.rows.length) throw conflict('print_claim_expired_or_invalid');
}

export async function finishPrint(id: string, token: string, outcome: 'submitted' | 'uncertain' | 'failed', printerId = 'principal'): Promise<void> {
  const result = await query(`update print_job set status=$3,finished_at=now(),result_code=$4
    where id=$1 and claim_token=$2 and printer_id=$5 and (
      (status='claimed' and $3 in ('failed','uncertain') and lease_until>now()) or
      (status in ('spooling','uncertain') and $3 in ('submitted','uncertain')) or status=$3
    ) returning id`, [id, token, outcome, outcome === 'submitted' ? 'accepted_by_windows_spooler' : outcome === 'failed' ? 'rejected_before_spooling' : 'operator_verification_required', printerId]);
  if (!result.rows.length) throw conflict('print_completion_not_allowed');
}

export async function getPrint(id: string, printerId?: string) {
  await expireLeases();
  const job = (await query<Job>('select * from print_job where id=$1 and ($2::text is null or printer_id=$2)', [id, printerId ?? null])).rows[0];
  if (!job) throw notFound('print_job_not_found');
  return metadata(job);
}

export async function listSalePrints(saleId: string) {
  await expireLeases();
  return (await query<Job>('select * from print_job where sale_id=$1 order by requested_at desc,id desc limit 20', [saleId])).rows.map(metadata);
}

export async function agentStatus(printerId = 'principal') {
  await expireLeases();
  const { rows } = await query(`select last_seen_at,last_seen_at>now()-interval '30 seconds' as online from print_agent_state where printer_id=$1`, [printerId]);
  const counts = (await query('select status,count(*)::int as count from print_job where printer_id=$1 group by status', [printerId])).rows;
  return { printer_id: printerId, last_seen_at: rows[0]?.last_seen_at ?? null, online: rows[0]?.online ?? false, counts };
}
