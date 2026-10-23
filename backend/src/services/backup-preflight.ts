import { constants } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getEnv } from '../config/env.js';
import { query } from '../db.js';
import { runBackupCommand } from '../utils/backup-command.js';

export type StorageCheck = { availableBytes: number; writable: true };
export async function checkBackupStorage(
  directory: string,
  minimumFreeBytes: number,
): Promise<StorageCheck> {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error('backup_storage_must_be_a_real_directory');
  await fs.access(directory, constants.R_OK | constants.W_OK | constants.X_OK);
  const capacity = await fs.statfs(directory);
  const availableBytes = Number(capacity.bavail) * Number(capacity.bsize);
  if (!Number.isSafeInteger(availableBytes) || availableBytes < minimumFreeBytes)
    throw new Error('backup_storage_free_space_below_reserve');
  const probe = path.join(directory, '.write-check-' + randomUUID());
  let handle;
  try {
    handle = await fs.open(probe, 'wx', 0o600);
    await handle.writeFile('probe');
    await handle.sync();
    await fs.link(probe, probe + '.link');
  } finally {
    await handle?.close();
    await fs.rm(probe + '.link', { force: true });
    await fs.rm(probe, { force: true });
  }
  return { availableBytes, writable: true };
}

export async function preflightBackup(signal?: AbortSignal) {
  const env = getEnv();
  const options = { timeoutMs: Math.min(env.BACKUP_OPERATION_TIMEOUT_MS, 10000), signal };
  const dump = await runBackupCommand('pg_dump', ['--version'], {}, options);
  const psql = await runBackupCommand('psql', ['--version'], {}, options);
  const major = (text: string) => Number(text.match(/PostgreSQL\)?\s+(\d+)/)?.[1]);
  const { rows } = await query<{ version: string }>(
    "select current_setting('server_version_num') as version",
  );
  const serverMajor = Math.floor(Number(rows[0]?.version) / 10000);
  if (
    serverMajor !== 16 ||
    major(dump.stdout) !== serverMajor ||
    major(psql.stdout) !== serverMajor
  )
    throw new Error('backup_postgresql_client_server_version_mismatch');
  const primary = await checkBackupStorage(
    path.resolve(env.BACKUP_PATH),
    env.BACKUP_MIN_FREE_BYTES,
  );
  let replica: StorageCheck | null = null;
  if (env.BACKUP_REPLICA_PATH) {
    const primaryPath = await fs.realpath(env.BACKUP_PATH);
    const replicaPath = path.resolve(env.BACKUP_REPLICA_PATH);
    replica = await checkBackupStorage(replicaPath, env.BACKUP_MIN_FREE_BYTES);
    const realReplica = await fs.realpath(replicaPath);
    const overlaps = (parent: string, child: string) => {
      const relative = path.relative(parent, child);
      return !relative || (!relative.startsWith('..') && !path.isAbsolute(relative));
    };
    if (overlaps(primaryPath, realReplica) || overlaps(realReplica, primaryPath))
      throw new Error('backup_replica_must_be_outside_primary_storage');
  }
  if (env.BACKUP_REQUIRE_REPLICA && !replica) throw new Error('backup_replica_required');
  return {
    ready: true,
    serverMajor,
    pgDumpVersion: dump.stdout.trim(),
    psqlVersion: psql.stdout.trim(),
    primary,
    replica: {
      configured: replica !== null,
      required: env.BACKUP_REQUIRE_REPLICA,
      storage: replica,
    },
    retentionCount: env.BACKUP_RETENTION_COUNT,
  };
}
