import { assertDestructiveOperationEnabled } from '../utils/destructive-operation-policy.js';
import { query } from '../db.js';
import { withBackupLock, type BackupLease } from './backup-lock.js';
import { notFound, HttpError } from '../errors.js';
import { getEnv } from '../config/env.js';
import { randomUUID } from 'node:crypto';
import { acquireRecoveryLease, assertTrustedBackup, preserveBackupCatalog, recoveryQuery, restoreBackupCatalog } from './recovery-control.js';
import { runPendingMigrations } from './migrations.js';
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
  userId: string | null;
  ipAddress?: string | null;
};

type OperationStatus = 'running' | 'completed' | 'failed' | 'rolled_back' | 'warning';
type OperationType = 'backup' | 'restore' | 'retention';

const env = getEnv();

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

export async function enforceRetentionPolicy(actor: Actor | null, context: string, lease?: BackupLease): Promise<void> {
  if (!lease) return withBackupLock((ownedLease) => enforceRetentionPolicy(actor, context, ownedLease));
  lease.assertHeld();
  const operationId = await createOperation('retention', actor, { context }, env.BACKUP_OPERATION_TIMEOUT_MS);

  try {
    await preserveBackupCatalog();
    if (BACKUP_RETENTION_COUNT <= 0) {
      await finishOperation(operationId, 'warning', {
        details: { context, skipped: true, reason: 'retention disabled' },
      });
      return;
    }

    const { rows } = await query<{ id: string; filename: string }>(
      `select id, filename
       from system_backup b
       where not exists (select 1 from pos_recovery.operation o
         where o.status in ('running', 'recovery_required')
           and (o.backup_filename=b.filename or o.snapshot_filename=b.filename))
       order by created_at desc
       offset $1`,
      [BACKUP_RETENTION_COUNT]
    );

    const deleted: string[] = [];
    for (const row of rows) {
      lease.assertHeld();
      await deleteBackupFile(row.filename);
      lease.assertHeld();
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
  return withBackupLock(async (lease) => {
    const operationId = await createOperation('backup', actor, { prefix }, env.BACKUP_OPERATION_TIMEOUT_MS);

    try {
      const backup = await createBackupArchive(prefix, env.BACKUP_OPERATION_TIMEOUT_MS, lease.signal);
      lease.assertHeld();

      await query(
        `insert into system_backup (filename, size_bytes, created_by, checksum, metadata)
         values ($1, $2, $3, $4, $5::jsonb)`,
        [backup.filename, backup.sizeBytes, actor.userId, backup.checksum, JSON.stringify(backup.metadata)]
      );

      await enforceRetentionPolicy(actor, 'backup:create', lease);

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

export type RestoreResult = {
  restored: boolean; rollbackApplied: boolean; operationId: string; snapshot: string;
  status: 'ok' | 'rolled_back';
};

async function finishRestore(operationId: string, status: string, details: Record<string, unknown>): Promise<void> {
  // This journal and the state fence survive replacement of the public schema.
  await recoveryQuery(`update pos_recovery.operation set status=$2, stage=$2,
    details=details || $3::jsonb, finished_at=now() where id=$1`, [operationId, status, JSON.stringify(details)]);
  if (status !== 'recovery_required') {
    await recoveryQuery('update pos_recovery.state set operation_id=null where operation_id=$1', [operationId]);
  }
}

async function completeRestoredDatabase(operationId: string, status: string): Promise<void> {
  await runPendingMigrations();
  await restoreBackupCatalog();
  if (status === 'completed') {
    await query('delete from auth_session');
    await query(`update system_legacy_import set status='failed', finished_at=now(), current_stage=null,
      error_message='Import interrupted by database restoration; submit a new import after reviewing the restored data'
      where status in ('queued', 'running', 'retrying')`);
  }
  // The actor may not exist in an older backup. Preserve the original identity
  // in the durable journal without relying on an FK into the restored schema.
  await query(`insert into audit_log(user_id, action, details)
    values (null, $1, $2::jsonb)`, [status === 'completed' ? 'BACKUP_RESTORE' : 'BACKUP_RESTORE_ROLLBACK_APPLIED', JSON.stringify({ operationId })]);
}

export async function restoreBackupWithRollback({ actor, filename }: {
  actor: Actor; filename: string;
}): Promise<RestoreResult> {
  assertDestructiveOperationEnabled('restore');
  const recovery = await acquireRecoveryLease(true);
  try {
    return await withBackupLock(async (backupLease) => {
      const signal = AbortSignal.any([recovery.signal, backupLease.signal]);
      await preserveBackupCatalog();
      const { rows } = await query<{ checksum: string | null }>('select checksum from system_backup where filename=$1', [filename]);
      if (!rows[0]) throw notFound('backup not found');
      const validation = await validateBackupArchive({ filename, expectedChecksum: rows[0].checksum });
      // A ZIP/checksum alone does not authenticate SQL. Only byte-identical
      // copies of archives generated by this installation may reach psql.
      await assertTrustedBackup(filename, validation.checksum);
      const operationId = randomUUID();
      await recoveryQuery(`insert into pos_recovery.operation(id, actor_id, status, stage, backup_filename)
        values ($1, $2, 'running', 'validating', $3)`, [operationId, actor.userId, filename]);
      await recoveryQuery('update pos_recovery.state set operation_id=$1 where singleton', [operationId]);
      let snapshotFilename: string | null = null;
      let cutoverStarted = false;
      try {
        const simulation = await simulateRestoreArchive({ filename, timeoutMs: env.BACKUP_SIMULATION_TIMEOUT_MS, signal });
        if (simulation.users < 1 || simulation.foreignKeys < 1) throw new Error('backup_invariants_failed');
        const snapshot = await createBackupArchive('snapshot', env.BACKUP_OPERATION_TIMEOUT_MS, signal);
        await validateBackupArchive({ filename: snapshot.filename, expectedChecksum: snapshot.checksum });
        await query(`insert into system_backup(filename, size_bytes, checksum, metadata, created_by)
          values ($1, $2, $3, $4::jsonb, $5)`, [snapshot.filename, snapshot.sizeBytes, snapshot.checksum,
          JSON.stringify({ ...snapshot.metadata, source: 'pre-restore', relatedBackup: filename, restoreOperationId: operationId }), actor.userId]);
        await preserveBackupCatalog();
        snapshotFilename = snapshot.filename;
        await recoveryQuery(`update pos_recovery.operation set snapshot_filename=$2, stage='cutover', details=$3::jsonb where id=$1`,
          [operationId, snapshotFilename, JSON.stringify({ simulation, checksum: validation.checksum })]);
        recovery.assertHeld(); backupLease.assertHeld();
        cutoverStarted = true;
        await restoreBackupArchive({ filename, timeoutMs: env.BACKUP_OPERATION_TIMEOUT_MS, signal });
        await completeRestoredDatabase(operationId, 'completed');
        recovery.assertHeld(); backupLease.assertHeld();
        await finishRestore(operationId, 'completed', { snapshot: snapshotFilename });
        return { restored: true, rollbackApplied: false, operationId, snapshot: snapshotFilename, status: 'ok' };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // No destructive statement has run. Do not replace the live database
        // merely because snapshot creation or the simulation failed.
        if (!cutoverStarted || !snapshotFilename) {
          await finishRestore(operationId, 'failed', { error: message });
          throw error;
        }
        // On loss of ownership keep the durable fence. Startup recovery obtains
        // a new exclusive lease before making any further database changes.
        if (signal.aborted) {
          await finishRestore(operationId, 'recovery_required', { error: message });
          throw new HttpError(503, 'database_restore_recovery_required', { operationId, snapshot: snapshotFilename });
        }
        try {
          await validateRecoverySnapshot(snapshotFilename);
          await restoreBackupArchive({ filename: snapshotFilename, timeoutMs: env.BACKUP_OPERATION_TIMEOUT_MS, signal });
          await completeRestoredDatabase(operationId, 'rolled_back');
          await finishRestore(operationId, 'rolled_back', { error: message });
        } catch (rollbackError) {
          await finishRestore(operationId, 'recovery_required', { error: message, rollbackError: String(rollbackError) });
          throw new HttpError(500, 'restore_failed_rollback_failed', { operationId, snapshot: snapshotFilename });
        }
        return { restored: false, rollbackApplied: true, operationId, snapshot: snapshotFilename, status: 'rolled_back' };
      }
    });
  } finally { await recovery.release(); }
}

async function validateRecoverySnapshot(filename: string): Promise<void> {
  const result = await recoveryQuery('select checksum from pos_recovery.archive where filename=$1 and trusted and not deleted', [filename]);
  if (!result.rows[0]) throw new Error('recovery_snapshot_not_verified');
  await validateBackupArchive({ filename, expectedChecksum: result.rows[0].checksum });
}

/** An interrupted cutover is reverted before the API/worker accepts work. */
export async function recoverInterruptedRestore(): Promise<void> {
  const state = await recoveryQuery('select operation_id from pos_recovery.state where singleton');
  if (!state.rows[0]?.operation_id) return;
  const recovery = await acquireRecoveryLease(true, true);
  try {
    const { rows } = await recoveryQuery(`select o.* from pos_recovery.operation o
      join pos_recovery.state s on s.operation_id=o.id where s.singleton`);
    const operation = rows[0];
    if (!operation) return;
    await withBackupLock(async (lease) => {
      if (operation.stage === 'validating' && !operation.snapshot_filename) {
        await finishRestore(operation.id, 'failed', { reason: 'interrupted_before_cutover' });
        return;
      }
      if (!operation.snapshot_filename) throw new Error('interrupted_restore_missing_snapshot');
      await validateRecoverySnapshot(operation.snapshot_filename);
      await restoreBackupArchive({ filename: operation.snapshot_filename, signal: AbortSignal.any([lease.signal, recovery.signal]) });
      await completeRestoredDatabase(operation.id, 'rolled_back');
      await finishRestore(operation.id, 'rolled_back', { reason: 'interrupted_restore_recovered' });
    });
  } finally { await recovery.release(); }
}
