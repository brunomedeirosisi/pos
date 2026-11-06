export type BackupScheduleInput = { enabled: boolean; time: string };
export type BackupExecution = {
  id: string;
  type: "manual" | "automatic" | "system";
  status: "running" | "completed" | "failed";
  scheduledFor: string | null;
  startedAt: string;
  finishedAt: string | null;
  filename: string | null;
  errorMessage: string | null;
};
export type BackupSchedule = BackupScheduleInput & {
  timezone: string;
  nextRunAt: string | null;
  updatedAt: string;
  lastRun: BackupExecution | null;
};
export type BackupRecord = {
  id: string;
  filename: string;
  sizeBytes: number;
  createdAt: string;
  checksum: string | null;
  metadata?: Record<string, unknown> | null;
  createdBy: {
    id: string;
    fullName: string;
  } | null;
};

export type RestoreRequest = {
  file: string;
  password: string;
  confirm: true;
};
export type RestoreResult = {
  status: "ok" | "rolled_back";
  restored: boolean;
  rollbackApplied: boolean;
  snapshot: string;
  operationId: string;
};
