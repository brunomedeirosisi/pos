import { HttpError } from "../errors.js";
import { logger } from "../observability/logger.js";
import { withBackupLock } from "./backup-lock.js";
import {
  acquireRecoveryLease,
  type RecoveryLease,
} from "./recovery-control.js";
import { createManagedBackup } from "./backup-restore-service.js";
import {
  claimScheduledBackup,
  finishScheduledBackup,
} from "../modules/backup/repository/backup-schedule-repository.js";

export const BACKUP_SCHEDULER_INTERVAL_MS = 15_000;

/** Durable DB clock/claim + the very same session lock used by manual backups. */
export async function runScheduledBackup(): Promise<void> {
  let recovery: RecoveryLease | undefined;
  try {
    recovery = await acquireRecoveryLease();
    const activeRecovery = recovery;
    await withBackupLock(async (lease) => {
      const run = await claimScheduledBackup();
      if (!run) return;
      lease.assertHeld();
      activeRecovery.assertHeld();
      try {
        const backup = await createManagedBackup(
          { userId: null },
          "automatic",
          {
            lease: {
              ...lease,
              signal: AbortSignal.any([lease.signal, activeRecovery.signal]),
              assertHeld: () => {
                lease.assertHeld();
                activeRecovery.assertHeld();
              },
            },
            automatic: { runId: run.id, scheduledFor: run.scheduledFor },
          },
        );
        lease.assertHeld();
        activeRecovery.assertHeld();
        await finishScheduledBackup(run.id, backup.filename, null);
        logger.info(
          {
            event: "automatic_backup_completed",
            runId: run.id,
            filename: backup.filename,
          },
          "Automatic backup completed",
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await finishScheduledBackup(run.id, null, message);
        logger.error(
          { event: "automatic_backup_failed", runId: run.id, message },
          "Automatic backup failed",
        );
      }
    });
  } catch (error) {
    // Busy manual backup/restore: leave the due occurrence pending, then retry.
    if (
      !(error instanceof HttpError) ||
      ![
        "backup_operation_in_progress",
        "database_restore_in_progress",
      ].includes(error.message)
    )
      throw error;
  } finally {
    await recovery?.release();
  }
}

export function startBackupScheduler(
  run = runScheduledBackup,
  intervalMs = BACKUP_SCHEDULER_INTERVAL_MS,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    try {
      await run();
    } catch (error) {
      logger.error(
        {
          event: "backup_scheduler_error",
          message: error instanceof Error ? error.message : String(error),
        },
        "Backup scheduler tick failed",
      );
    } finally {
      if (!stopped) {
        timer = setTimeout(() => {
          void tick();
        }, intervalMs);
        timer.unref();
      }
    }
  };
  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
