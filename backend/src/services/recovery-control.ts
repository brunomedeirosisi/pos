import { Pool, type PoolClient } from 'pg';
import { readFile } from 'node:fs/promises';
import { getEnv } from '../config/env.js';
import { HttpError } from '../errors.js';

export const RECOVERY_LOCK_KEY = 20_261_029;
const env = getEnv();
// Request leases must not consume the business pool: every request also needs
// a connection there to finish its work and release its lease.
const control = new Pool({
  host: env.POSTGRES_HOST, port: env.POSTGRES_PORT, user: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD, database: env.POSTGRES_DB,
  max: env.POSTGRES_POOL_MAX, connectionTimeoutMillis: env.POSTGRES_CONNECTION_TIMEOUT_MS,
});
control.on('error', () => { /* Leases handle their own connection loss. */ });
let initialized: Promise<void> | undefined;

export async function initializeRecoveryControl(): Promise<void> {
  initialized ??= (async () => {
    const sql = await readFile(new URL('../../sql/recovery.sql', import.meta.url), 'utf8');
    await control.query(sql);
  })().catch((error) => { initialized = undefined; throw error; });
  await initialized;
}

export async function closeRecoveryControl(): Promise<void> { await control.end(); }

export async function recoveryQuery(text: string, values?: unknown[]) {
  await initializeRecoveryControl();
  return control.query(text, values);
}

export type RecoveryLease = { signal: AbortSignal; assertHeld(): void; release(): Promise<void> };

export async function acquireRecoveryLease(exclusive = false, allowInterrupted = false): Promise<RecoveryLease> {
  await initializeRecoveryControl();
  const client: PoolClient = await control.connect();
  const abort = new AbortController();
  let held = false;
  let discarded = false;
  let released = false;
  const lost = () => { discarded = true; abort.abort(new Error('recovery_lock_connection_lost')); };
  client.on('error', lost); client.on('end', lost);
  const release = async () => {
    if (released) return;
    released = true;
    try {
      if (held && !discarded) {
        const result = await client.query(`select pg_advisory_unlock${exclusive ? '' : '_shared'}($1) as unlocked`, [RECOVERY_LOCK_KEY]);
        if (!result.rows[0]?.unlocked) discarded = true;
      }
    } catch { discarded = true; }
    finally { client.removeListener('error', lost); client.removeListener('end', lost); client.release(discarded); }
  };
  try {
    const result = await client.query(`select pg_try_advisory_lock${exclusive ? '' : '_shared'}($1) as locked`, [RECOVERY_LOCK_KEY]);
    held = result.rows[0]?.locked === true;
    if (!held) throw new HttpError(exclusive ? 409 : 503, exclusive ? 'restore_database_busy' : 'database_restore_in_progress');
    const state = await client.query('select operation_id from pos_recovery.state where singleton');
    if (!allowInterrupted && state.rows[0]?.operation_id) throw new HttpError(503, 'database_restore_in_progress');
    return { signal: abort.signal, assertHeld: () => abort.signal.throwIfAborted(), release };
  } catch (error) { await release(); throw error; }
}

export async function withRecoveryReadLock<T>(work: () => Promise<T>): Promise<T> {
  const lease = await acquireRecoveryLease();
  try { const result = await work(); lease.assertHeld(); return result; }
  finally { await lease.release(); }
}

/** Only server-created catalog records establish trust; upload metadata never does. */
export async function preserveBackupCatalog(): Promise<void> {
  await recoveryQuery(`insert into pos_recovery.archive(filename, checksum, size_bytes, metadata, created_at, trusted)
    select filename, checksum, coalesce(size_bytes, 0), metadata, created_at,
      coalesce(metadata->>'source', '') <> 'upload'
    from public.system_backup where checksum is not null
    on conflict (filename) do nothing`);
}

export async function assertTrustedBackup(filename: string, checksum: string): Promise<void> {
  const result = await recoveryQuery(`select 1 from pos_recovery.archive
    where checksum=$1 and trusted`, [checksum]);
  if (!result.rowCount) throw new HttpError(422, 'backup_source_not_verified', { filename });
}

export async function assertBackupNotPinned(filename: string): Promise<void> {
  const result = await recoveryQuery(`select 1 from pos_recovery.operation where status in ('running', 'recovery_required')
    and (backup_filename=$1 or snapshot_filename=$1)`, [filename]);
  if (result.rowCount) throw new HttpError(409, 'backup_required_for_recovery');
}

export async function restoreBackupCatalog(): Promise<void> {
  await recoveryQuery(`delete from public.system_backup b using pos_recovery.archive a
    where a.filename=b.filename and a.deleted`);
  await recoveryQuery(`insert into public.system_backup(filename, checksum, size_bytes, metadata, created_at, created_by)
    select filename, checksum, size_bytes, metadata, created_at, null
    from pos_recovery.archive where not deleted
    on conflict (filename) do update set checksum=excluded.checksum, size_bytes=excluded.size_bytes,
      metadata=excluded.metadata`);
}
