import type { PoolClient } from 'pg';
import { acquireDatabaseClient } from '../db.js';
import { conflict } from '../errors.js';
import { logger } from '../observability/logger.js';

export const BACKUP_LOCK_KEY = 20_240_917;
export type BackupLease = { signal: AbortSignal; backendPid: number; assertHeld(): void };

/** One borrowed session owns the lock for the entire operation, including file changes. */
export async function withBackupLock<T>(work: (lease: BackupLease) => Promise<T>): Promise<T> {
  const client: PoolClient = await acquireDatabaseClient();
  const controller = new AbortController();
  let locked = false,
    lost = false,
    workFailed = false,
    unlockFailed = false;
  const loseConnection = () => {
    lost = true;
    controller.abort();
  };
  client.on('error', loseConnection);
  client.on('end', loseConnection);
  try {
    const { rows } = await client.query<{ locked: boolean; pid: number }>(
      'select pg_try_advisory_lock($1) as locked, pg_backend_pid() as pid',
      [BACKUP_LOCK_KEY],
    );
    locked = rows[0]?.locked === true;
    if (!locked) throw conflict('backup_operation_in_progress');
    const lease: BackupLease = {
      signal: controller.signal,
      backendPid: rows[0].pid,
      assertHeld() {
        if (lost || controller.signal.aborted) throw new Error('backup_lock_connection_lost');
      },
    };
    lease.assertHeld();
    const result = await work(lease);
    lease.assertHeld();
    return result;
  } catch (error) {
    workFailed = true;
    throw error;
  } finally {
    if (locked && !lost) {
      try {
        const { rows } = await client.query<{ unlocked: boolean }>(
          'select pg_advisory_unlock($1) as unlocked',
          [BACKUP_LOCK_KEY],
        );
        if (rows[0]?.unlocked !== true) throw new Error('backup_lock_not_released');
      } catch {
        unlockFailed = true;
      }
    }
    client.removeListener('error', loseConnection);
    client.removeListener('end', loseConnection);
    client.release(lost || unlockFailed);
    if (unlockFailed)
      logger.error(
        { event: 'backup_lock_release_failed' },
        'Dedicated backup connection discarded',
      );
    if ((unlockFailed || lost) && !workFailed) throw new Error('backup_lock_connection_lost');
  }
}
