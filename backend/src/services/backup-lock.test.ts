import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ acquire: vi.fn() }));
vi.mock('../db.js', () => ({ acquireDatabaseClient: state.acquire }));
import { withBackupLock } from './backup-lock.js';
beforeEach(() => vi.clearAllMocks());
function client(unlocked: boolean) {
  return Object.assign(new EventEmitter(), {
    query: vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ locked: true, pid: 42 }] })
      .mockResolvedValueOnce({ rows: [{ unlocked }] }),
    release: vi.fn(),
  });
}
describe('backup lock release verification', () => {
  it('discards a session whose unlock result cannot be verified', async () => {
    const session = client(false);
    state.acquire.mockResolvedValueOnce(session);
    await expect(withBackupLock(async () => 'done')).rejects.toThrow('backup_lock_connection_lost');
    expect(session.release).toHaveBeenCalledWith(true);
  });
  it('preserves the original failure while discarding a session with a failed unlock', async () => {
    const session = client(false);
    state.acquire.mockResolvedValueOnce(session);
    await expect(
      withBackupLock(async () => {
        throw new Error('original failure');
      }),
    ).rejects.toThrow('original failure');
    expect(session.release).toHaveBeenCalledWith(true);
  });
});
