# Backup/Restore Operational Runbook

## Restore flow (safe mode)
1. Acquire exclusive backup lock (process + DB advisory lock).
2. Validate backup file existence and filename safety.
3. Validate checksum against `system_backup.checksum`.
4. Validate archive structure (`backup.sql` + `backup.json`).
5. Run simulation restore on temporary database.
6. Create pre-restore snapshot backup.
7. Attempt restore to target database.
8. If restore fails, automatically rollback using pre-restore snapshot.
9. Persist operation trace in `system_backup_operation`.

## Observability and traceability
- Table: `system_backup_operation`
- Statuses:
  - `running`
  - `completed`
  - `rolled_back`
  - `failed`
  - `warning`
- Key audit events:
  - `BACKUP_RESTORE_VALIDATED`
  - `BACKUP_RESTORE_SIMULATION_OK`
  - `BACKUP_RESTORE`
  - `BACKUP_RESTORE_ROLLBACK_APPLIED`
  - `BACKUP_RETENTION_FAILURE`

## Retention policy
- Applied after backup create/upload and pre-restore snapshot creation.
- Failures do not block operation completion, but are logged and audited.
