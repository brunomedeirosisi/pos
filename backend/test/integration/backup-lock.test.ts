import { afterAll, describe, expect, it } from 'vitest';
import { acquireDatabaseClient, query, closeDatabase } from '../../src/db.js';
import { BACKUP_LOCK_KEY, withBackupLock } from '../../src/services/backup-lock.js';
afterAll(() => closeDatabase());
async function ownedLocks() {
  return (
    await query(
      "select count(*)::int as count from pg_locks where locktype='advisory' and classid=0 and objid=$1 and granted",
      [BACKUP_LOCK_KEY],
    )
  ).rows[0].count;
}
describe('real session-owned backup lock', () => {
  it('holds the same backend session while other pool connections are busy, then releases', async () => {
    const held = await Promise.all([acquireDatabaseClient(), acquireDatabaseClient()]);
    try {
      await withBackupLock(async (lease) => {
        const locks = await query(
          "select pid from pg_locks where locktype='advisory' and classid=0 and objid=$1 and granted",
          [BACKUP_LOCK_KEY],
        );
        expect(locks.rows).toEqual([{ pid: lease.backendPid }]);
        await expect(withBackupLock(async () => 'unexpected')).rejects.toMatchObject({
          statusCode: 409,
          message: 'backup_operation_in_progress',
        });
        expect(lease.signal.aborted).toBe(false);
      });
      expect(await ownedLocks()).toBe(0);
    } finally {
      for (const client of held) client.release();
    }
  });
  it('releases after failed work and permits the next operation', async () => {
    await expect(
      withBackupLock(async () => {
        throw new Error('synthetic work failure');
      }),
    ).rejects.toThrow('synthetic work failure');
    expect(await ownedLocks()).toBe(0);
    expect(await withBackupLock(async () => 'next')).toBe('next');
  });
  it('aborts when its own connection is terminated and never returns a lost session to the pool', async () => {
    await expect(
      withBackupLock(async (lease) => {
        const cancelled = new Promise<void>((resolve) =>
          lease.signal.addEventListener('abort', () => resolve(), { once: true }),
        );
        await query('select pg_terminate_backend($1)', [lease.backendPid]);
        await cancelled;
        lease.assertHeld();
      }),
    ).rejects.toThrow('backup_lock_connection_lost');
    expect(await ownedLocks()).toBe(0);
    expect(await withBackupLock(async () => 'recovered')).toBe('recovered');
  });
});
