import { setTimeout } from 'node:timers/promises';
import type { PoolClient } from 'pg';
import { acquireDatabaseClient } from '../../db.js';
import { initializeRecoveryControl, RECOVERY_LOCK_KEY } from '../recovery-control.js';
import { HttpError } from '../../errors.js';

export const LEGACY_IMPORT_LOCK_KEY = 20_261_022;

/** All import SQL must use this session: losing the lock also stops its writes. */
export async function withLegacyImportLock<T>(
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  await initializeRecoveryControl();
  const client = await acquireDatabaseClient();
  const controller = new AbortController();
  let locked = false;
  let recoveryLocked = false;
  let discard = false;
  let workFailed = false;
  let releaseError: unknown;
  const lost = () => {
    discard = true;
    controller.abort(new Error('legacy_import_lock_connection_lost'));
  };
  client.on('error', lost);
  client.on('end', lost);
  try {
    const recovery = await client.query<{ locked: boolean }>('select pg_try_advisory_lock_shared($1) as locked', [RECOVERY_LOCK_KEY]);
    recoveryLocked = recovery.rows[0]?.locked === true;
    if (!recoveryLocked) throw new HttpError(503, 'database_restore_in_progress');
    const state = await client.query('select operation_id from pos_recovery.state where singleton');
    if (state.rows[0]?.operation_id) throw new HttpError(503, 'database_restore_in_progress');
    // Contention waits here rather than consuming a BullMQ retry or relying on
    // concurrency:1, which only serializes one worker instance.
    while (!locked) {
      controller.signal.throwIfAborted();
      const result = await client.query<{ locked: boolean }>(
        'select pg_try_advisory_lock($1) as locked',
        [LEGACY_IMPORT_LOCK_KEY],
      );
      locked = result.rows[0]?.locked === true;
      if (!locked) await setTimeout(250, undefined, { signal: controller.signal });
    }
    const result = await work(client);
    controller.signal.throwIfAborted();
    return result;
  } catch (error) {
    workFailed = true;
    throw error;
  } finally {
    try {
      if (locked && !discard) {
        const result = await client.query<{ unlocked: boolean }>(
          'select pg_advisory_unlock($1) as unlocked',
          [LEGACY_IMPORT_LOCK_KEY],
        );
        if (result.rows[0]?.unlocked !== true) {
          discard = true;
          throw new Error('legacy_import_lock_not_released');
        }
      }
      if (recoveryLocked && !discard) {
        const recovery = await client.query<{ unlocked: boolean }>('select pg_advisory_unlock_shared($1) as unlocked', [RECOVERY_LOCK_KEY]);
        if (!recovery.rows[0]?.unlocked) throw new Error('legacy_recovery_lock_not_released');
      }
    } catch (error) {
      discard = true;
      // Discarding the session releases any remaining lock. Do not acknowledge
      // successful work if we cannot confirm ownership through completion.
      releaseError = error;
    } finally {
      client.removeListener('error', lost);
      client.removeListener('end', lost);
      client.release(discard);
    }
    if (releaseError && !workFailed) throw releaseError;
  }
}

export async function withImportTransaction<T>(
  client: PoolClient,
  work: () => Promise<T>,
): Promise<T> {
  await client.query('begin');
  try {
    const result = await work();
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  }
}
