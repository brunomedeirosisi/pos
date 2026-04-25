import { query } from '../db.js';
import { badRequest, notFound, HttpError } from '../errors.js';
import { getEnv } from '../config/env.js';
import { logAudit } from '../utils/audit.js';
import {
  BACKUP_RETENTION_COUNT,
  createBackupArchive,
  deleteBackupFile,
  restoreBackupArchive,
  simulateRestoreArchive,
  validateBackupArchive,
  type BackupCreateResult,
} from '../utils/backup.js';

type Actor = {
  userId: string;
  ipAddress?: string | null;
};

type OperationStatus = 'running' | 'completed' | 'failed' | 'rolled_back' | 'warning';
type OperationType = 'backup' | 'restore' | 'retention';

const env = getEnv();
const BACKUP_LOCK_KEY = 2_024_0917;
let processLock = false;

async function ensureOperationSchema(): Promise<void> {
  await query(`
    create table if not exists system_backup_operation (
      id uuid primary key default gen_random_uuid(),
      operation_type text not null check (operation_type in ('backup', 'restore', 'retention')),
      status text not null check (status in ('running', 'completed', 'failed', 'rolled_back', 'warning')),
      backup_filename text,
      snapshot_filename text,
      requested_by uuid references app_user(id),
      started_at timestamptz not null default now(),
      finished_at timestamptz,
      timeout_ms integer,
      details jsonb,
      error_message text
    )
  `);
  await query(
    `create index if not exists idx_system_backup_operation_started_at on system_backup_operation(started_at desc)`
  );
  await query(
    `create index if not exists idx_system_backup_operation_type_status on system_backup_operation(operation_type, status)`
  );
}

async function createOperation(
  type: OperationType,
  actor: Actor | null,
  details: Record<string, unknown>,
  timeoutMs: number
): Promise<string> {
  await ensureOperationSchema();
  const { rows } = await query<{ id: string }>(
    `insert into system_backup_operation (operation_type, status, requested_by, timeout_ms, details)
     values ($1, 'running', $2, $3, $4::jsonb)
     returning id`,
    [type, actor?.userId ?? null, timeoutMs, JSON.stringify(details)]
  );
  return rows[0].id;
}

async function finishOperation(
  operationId: string,
  status: OperationStatus,
  updates: {
    backupFilename?: string | null;
    snapshotFilename?: string | null;
    details?: Record<string, unknown> | null;
    errorMessage?: string | null;
  }
): Promise<void> {
  await query(
    `update system_backup_operation
     set status = $2,
         backup_filename = coalesce($3, backup_filename),
         snapshot_filename = coalesce($4, snapshot_filename),
         details = coalesce($5::jsonb, details),
         error_message = $6,
         finished_at = now()
     where id = $1`,
    [
      operationId,
      status,
      updates.backupFilename ?? null,
      updates.snapshotFilename ?? null,
      updates.details ? JSON.stringify(updates.details) : null,
      updates.errorMessage ?? null,
    ]
  );
}

async function withBackupLock<T>(work: () => Promise<T>): Promise<T> {
  if (processLock) {
    throw badRequest('backup operation already in progress');
  }

  processLock = true;
  let advisoryLocked = false;
  try {
    const { rows } = await query<{ locked: boolean }>('select pg_try_advisory_lock($1) as locked', [BACKUP_LOCK_KEY]);
    advisoryLocked = Boolean(rows[0]?.locked);
    if (!advisoryLocked) {
      throw badRequest('backup operation already in progress');
    }

    return await work();
  } finally {
    if (advisoryLocked) {
      await query('select pg_advisory_unlock($1)', [BACKUP_LOCK_KEY]).catch(() => {});
    }
    processLock = false;
  }
}

export async function enforceRetentionPolicy(actor: Actor | null, context: string): Promise<void> {
  const operationId = await createOperation('retention', actor, { context }, env.BACKUP_OPERATION_TIMEOUT_MS);

  try {
    if (BACKUP_RETENTION_COUNT <= 0) {
      await finishOperation(operationId, 'warning', {
        details: { context, skipped: true, reason: 'retention disabled' },
      });
      return;
    }

    const { rows } = await query<{ id: string; filename: string }>(
      `select id, filename
       from system_backup
       order by created_at desc
       offset $1`,
      [BACKUP_RETENTION_COUNT]
    );

    const deleted: string[] = [];
    for (const row of rows) {
      await deleteBackupFile(row.filename);
      await query('delete from system_backup where id = $1', [row.id]);
      deleted.push(row.filename);
    }

    await finishOperation(operationId, 'completed', {
      details: { context, removedCount: deleted.length, removed: deleted },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishOperation(operationId, 'warning', {
      details: { context },
      errorMessage: message,
    });

    console.error('[backup] retention policy failed', { context, message });
    if (actor?.userId) {
      await logAudit({
        userId: actor.userId,
        action: 'BACKUP_RETENTION_FAILURE',
        details: { context, message },
        ipAddress: actor.ipAddress ?? null,
      }).catch(() => {});
    }
  }
}

export async function createManagedBackup(actor: Actor, prefix = 'backup'): Promise<BackupCreateResult> {
  return withBackupLock(async () => {
    const operationId = await createOperation('backup', actor, { prefix }, env.BACKUP_OPERATION_TIMEOUT_MS);

    try {
      const backup = await createBackupArchive(prefix, env.BACKUP_OPERATION_TIMEOUT_MS);

      await query(
        `insert into system_backup (filename, size_bytes, created_by, checksum, metadata)
         values ($1, $2, $3, $4, $5::jsonb)`,
        [backup.filename, backup.sizeBytes, actor.userId, backup.checksum, JSON.stringify(backup.metadata)]
      );

      await enforceRetentionPolicy(actor, 'backup:create');

      await logAudit({
        userId: actor.userId,
        action: 'BACKUP_CREATE',
        details: { filename: backup.filename, sizeBytes: backup.sizeBytes, operationId },
        ipAddress: actor.ipAddress ?? null,
      });

      await finishOperation(operationId, 'completed', {
        backupFilename: backup.filename,
        details: { checksum: backup.checksum, sizeBytes: backup.sizeBytes },
      });

      return backup;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await finishOperation(operationId, 'failed', {
        errorMessage: message,
      });
      throw error;
    }
  });
}

export async function restoreBackupWithRollback({
  actor,
  filename,
}: {
  actor: Actor;
  filename: string;
}): Promise<{ restored: boolean; rollbackApplied: boolean; operationId: string; snapshot: string; status: 'ok' | 'rolled_back' }> {
  return withBackupLock(async () => {
    const operationId = await createOperation(
      'restore',
      actor,
      { filename, dryRun: true, checksumValidation: true },
      env.BACKUP_OPERATION_TIMEOUT_MS
    );

    let snapshotFilename: string | null = null;

    try {
      const { rows } = await query<{ filename: string; checksum: string | null }>(
        `select filename, checksum from system_backup where filename = $1`,
        [filename]
      );
      const target = rows[0];
      if (!target) {
        throw notFound('backup not found');
      }

      await validateBackupArchive({
        filename: target.filename,
        expectedChecksum: target.checksum ?? undefined,
      });

      await logAudit({
        userId: actor.userId,
        action: 'BACKUP_RESTORE_VALIDATED',
        details: { filename: target.filename, operationId },
        ipAddress: actor.ipAddress ?? null,
      });

      await simulateRestoreArchive({
        filename: target.filename,
        timeoutMs: env.BACKUP_SIMULATION_TIMEOUT_MS,
      });

      await logAudit({
        userId: actor.userId,
        action: 'BACKUP_RESTORE_SIMULATION_OK',
        details: { filename: target.filename, operationId },
        ipAddress: actor.ipAddress ?? null,
      });

      const snapshot = await createBackupArchive('snapshot', env.BACKUP_OPERATION_TIMEOUT_MS);
      snapshotFilename = snapshot.filename;

      await query(
        `insert into system_backup (filename, size_bytes, created_by, checksum, metadata)
         values ($1, $2, $3, $4, $5::jsonb)`,
        [
          snapshot.filename,
          snapshot.sizeBytes,
          actor.userId,
          snapshot.checksum,
          JSON.stringify({
            ...snapshot.metadata,
            source: 'pre-restore',
            relatedBackup: target.filename,
            restoreOperationId: operationId,
          }),
        ]
      );

      await enforceRetentionPolicy(actor, 'backup:pre-restore-snapshot');

      await restoreBackupArchive({
        filename: target.filename,
        timeoutMs: env.BACKUP_OPERATION_TIMEOUT_MS,
      });

      await logAudit({
        userId: actor.userId,
        action: 'BACKUP_RESTORE',
        details: { filename: target.filename, snapshot: snapshot.filename, operationId },
        ipAddress: actor.ipAddress ?? null,
      });

      await finishOperation(operationId, 'completed', {
        backupFilename: target.filename,
        snapshotFilename: snapshot.filename,
        details: { simulation: 'passed', checksum: 'validated' },
      });

      return {
        restored: true,
        rollbackApplied: false,
        operationId,
        snapshot: snapshot.filename,
        status: 'ok',
      };
    } catch (error) {
      const restoreErrorMessage = error instanceof Error ? error.message : String(error);

      if (!snapshotFilename) {
        await finishOperation(operationId, 'failed', {
          backupFilename: filename,
          errorMessage: restoreErrorMessage,
        });
        throw error;
      }

      try {
        await restoreBackupArchive({
          filename: snapshotFilename,
          timeoutMs: env.BACKUP_OPERATION_TIMEOUT_MS,
        });

        await logAudit({
          userId: actor.userId,
          action: 'BACKUP_RESTORE_ROLLBACK_APPLIED',
          details: {
            requestedBackup: filename,
            snapshot: snapshotFilename,
            operationId,
            restoreErrorMessage,
          },
          ipAddress: actor.ipAddress ?? null,
        });

        await finishOperation(operationId, 'rolled_back', {
          backupFilename: filename,
          snapshotFilename,
          details: {
            rollbackApplied: true,
          },
          errorMessage: restoreErrorMessage,
        });
      } catch (rollbackError) {
        const rollbackErrorMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);

        await finishOperation(operationId, 'failed', {
          backupFilename: filename,
          snapshotFilename,
          details: {
            rollbackApplied: false,
          },
          errorMessage: `${restoreErrorMessage}; rollback: ${rollbackErrorMessage}`,
        });

        throw new HttpError(500, 'restore_failed_rollback_failed', {
          operationId,
          snapshot: snapshotFilename,
        });
      }
      return {
        restored: false,
        rollbackApplied: true,
        operationId,
        snapshot: snapshotFilename,
        status: 'rolled_back',
      };
    }
  });
}
