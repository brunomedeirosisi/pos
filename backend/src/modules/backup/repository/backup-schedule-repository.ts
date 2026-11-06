import { query, withTransaction } from "../../../db.js";
import { recoveryQuery } from "../../../services/recovery-control.js";
import { logAudit } from "../../../utils/audit.js";
import type {
  BackupExecution,
  BackupSchedule,
  BackupScheduleInput,
} from "../contracts/backup-schedule-contracts.js";

type RunRow = {
  id: string;
  type: BackupExecution["type"];
  status: BackupExecution["status"];
  scheduled_for: Date | string | null;
  started_at: Date | string;
  finished_at: Date | string | null;
  backup_filename: string | null;
  error_message: string | null;
};
function iso(value: Date | string): string {
  return new Date(value).toISOString();
}
export function mapBackupExecution(row: RunRow): BackupExecution {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    scheduledFor: row.scheduled_for ? iso(row.scheduled_for) : null,
    startedAt: iso(row.started_at),
    finishedAt: row.finished_at ? iso(row.finished_at) : null,
    filename: row.backup_filename,
    errorMessage: row.error_message,
  };
}

// Automatic receipts are durable even when the business database is restored.
// Manual/system executions reuse the existing operation journal; retention and
// restore operations have their own histories and are not backup creations.
export const backupExecutionSql = `select id,'automatic'::text as type,status,scheduled_for,started_at,finished_at,backup_filename,error_message
  from pos_recovery.backup_run
  union all
  select id,case when requested_by is null then 'system' else 'manual' end as type,
    status,null::timestamptz as scheduled_for,started_at,finished_at,backup_filename,error_message
  from system_backup_operation where operation_type='backup'
    and coalesce(details->>'trigger','manual')<>'automatic'`;

export async function getBackupSchedule(): Promise<BackupSchedule> {
  const { rows } =
    await recoveryQuery(`select enabled,left(daily_time::text,5) as time,
    current_setting('TimeZone') as timezone,next_run_at,updated_at,
    (select row_to_json(r) from (select *, 'automatic'::text as type from pos_recovery.backup_run
      order by started_at desc,id desc limit 1) r) as last_run
    from pos_recovery.backup_schedule where singleton`);
  const row = rows[0];
  return {
    enabled: row.enabled,
    time: row.time,
    timezone: row.timezone,
    nextRunAt: row.next_run_at ? iso(row.next_run_at) : null,
    updatedAt: iso(row.updated_at),
    lastRun: row.last_run ? mapBackupExecution(row.last_run) : null,
  };
}

export async function saveBackupSchedule(
  input: BackupScheduleInput,
  actor: { userId: string; ipAddress?: string | null },
): Promise<BackupSchedule> {
  await withTransaction(async (client) => {
    const previous = (
      await query(
        "select enabled,daily_time::text from pos_recovery.backup_schedule where singleton for update",
        [],
        client,
      )
    ).rows[0];
    await query(
      `update pos_recovery.backup_schedule set enabled=$1,daily_time=$2::time,
      next_run_at=case when not $1 then null
        when enabled and daily_time=$2::time then next_run_at
        else pos_recovery.next_backup_at($2::time,statement_timestamp(),current_setting('TimeZone')) end,
      updated_at=now(),updated_by=$3 where singleton`,
      [input.enabled, input.time, actor.userId],
      client,
    );
    await logAudit({
      userId: actor.userId,
      action: "BACKUP_SCHEDULE_UPDATED",
      details: { previous, enabled: input.enabled, time: input.time },
      ipAddress: actor.ipAddress,
      client,
    });
  });
  return getBackupSchedule();
}

/** Caller owns the session backup lock and a recovery read lease. */
export async function claimScheduledBackup(): Promise<{
  id: string;
  scheduledFor: string;
} | null> {
  return withTransaction(async (client) => {
    // No other backup can be running while this process owns the global lock.
    // A catalog entry proves publication completed before a previous process died.
    await query(
      `update pos_recovery.backup_run r set
      status=case when b.filename is null then 'failed' else 'completed' end,
      backup_filename=b.filename,finished_at=now(),
      error_message=case when b.filename is null then 'automatic_backup_interrupted' else null end
      from (select r.id,b.filename from pos_recovery.backup_run r left join system_backup b
        on b.metadata->>'automaticRunId'=r.id::text where r.status='running') b
      where r.id=b.id and r.status='running'`,
      [],
      client,
    );
    await query(
      `update system_backup_operation o set
        status=case when b.filename is null then 'failed' else 'completed' end,
        backup_filename=coalesce(o.backup_filename,b.filename),finished_at=now(),
        error_message=case when b.filename is null then 'backup_interrupted' else null end
        from (select o.id,b.filename from system_backup_operation o left join system_backup b
          on b.metadata->>'operationId'=o.id::text or b.filename=o.backup_filename
          where o.operation_type='backup' and o.status='running') b
        where o.id=b.id and o.status='running'`,
      [], client,
    );
    const schedule = (
      await query(
        `select next_run_at from pos_recovery.backup_schedule
      where singleton and enabled and next_run_at<=statement_timestamp() for update`,
        [],
        client,
      )
    ).rows[0];
    if (!schedule) return null;
    const { rows } = await query(
      `insert into pos_recovery.backup_run(scheduled_for,status)
      values($1,'running') on conflict(scheduled_for) do nothing returning id,scheduled_for`,
      [schedule.next_run_at],
      client,
    );
    // Coalesce missed days into one attempt and continue at the next future slot.
    await query(
      `update pos_recovery.backup_schedule set next_run_at=
      pos_recovery.next_backup_at(daily_time,statement_timestamp(),current_setting('TimeZone')) where singleton`,
      [],
      client,
    );
    return rows[0]
      ? { id: rows[0].id, scheduledFor: iso(rows[0].scheduled_for) }
      : null;
  });
}

export async function finishScheduledBackup(
  id: string,
  filename: string | null,
  error: string | null,
): Promise<void> {
  await recoveryQuery(
    `update pos_recovery.backup_run set status=$2,backup_filename=$3,error_message=$4,finished_at=now()
    where id=$1 and status='running'`,
    [
      id,
      error ? "failed" : "completed",
      filename,
      error?.slice(0, 2000) ?? null,
    ],
  );
}
