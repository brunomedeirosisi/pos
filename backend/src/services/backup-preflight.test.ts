import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  config: {
    BACKUP_PATH: '',
    BACKUP_REPLICA_PATH: undefined as string | undefined,
    BACKUP_REQUIRE_REPLICA: false,
    BACKUP_MIN_FREE_BYTES: 1,
    BACKUP_RETENTION_COUNT: 7,
    BACKUP_OPERATION_TIMEOUT_MS: 30000,
  },
  query: vi.fn(),
  command: vi.fn(),
}));
vi.mock('../config/env.js', () => ({ getEnv: () => state.config }));
vi.mock('../db.js', () => ({ query: state.query }));
vi.mock('../utils/backup-command.js', () => ({ runBackupCommand: state.command }));
import { checkBackupStorage, preflightBackup } from './backup-preflight.js';
let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'pos-backup-preflight-test-'));
  Object.assign(state.config, {
    BACKUP_PATH: path.join(root, 'primary'),
    BACKUP_REPLICA_PATH: undefined,
    BACKUP_REQUIRE_REPLICA: false,
    BACKUP_MIN_FREE_BYTES: 1,
  });
  state.query.mockResolvedValue({ rows: [{ version: '160015' }] });
  state.command.mockResolvedValue({ stdout: 'pg_dump (PostgreSQL) 16.15', stderr: '' });
});
afterEach(async () => {
  if (
    path.dirname(root) !== path.resolve(os.tmpdir()) ||
    !path.basename(root).startsWith('pos-backup-preflight-test-')
  )
    throw new Error('Unsafe cleanup');
  await fs.rm(root, { recursive: true, force: true });
  vi.clearAllMocks();
});
describe('backup readiness', () => {
  it('checks real write/sync/publication support and removes probes', async () => {
    const report = await preflightBackup();
    expect(report).toMatchObject({ ready: true, serverMajor: 16, replica: { configured: false } });
    expect(await fs.readdir(state.config.BACKUP_PATH)).toEqual([]);
  });
  it('refuses space below the reserve', async () => {
    await expect(
      checkBackupStorage(state.config.BACKUP_PATH, Number.MAX_SAFE_INTEGER),
    ).rejects.toThrow('backup_storage_free_space_below_reserve');
    expect(await fs.readdir(state.config.BACKUP_PATH)).toEqual([]);
  });
  it('refuses a file as backup directory', async () => {
    await fs.writeFile(state.config.BACKUP_PATH, 'preserve');
    await expect(checkBackupStorage(state.config.BACKUP_PATH, 1)).rejects.toThrow();
    expect(await fs.readFile(state.config.BACKUP_PATH, 'utf8')).toBe('preserve');
  });
  it('refuses an incompatible PostgreSQL major before storage writes', async () => {
    state.command.mockResolvedValue({ stdout: 'pg_dump (PostgreSQL) 17.11', stderr: '' });
    await expect(preflightBackup()).rejects.toThrow(
      'backup_postgresql_client_server_version_mismatch',
    );
    await expect(fs.stat(state.config.BACKUP_PATH)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('checks a distinct replica and refuses overlapping paths', async () => {
    state.config.BACKUP_REPLICA_PATH = path.join(root, 'replica');
    state.config.BACKUP_REQUIRE_REPLICA = true;
    expect((await preflightBackup()).replica.configured).toBe(true);
    state.config.BACKUP_REPLICA_PATH = path.join(state.config.BACKUP_PATH, 'nested');
    await expect(preflightBackup()).rejects.toThrow(
      'backup_replica_must_be_outside_primary_storage',
    );
  });
});
