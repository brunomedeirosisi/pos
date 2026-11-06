import { z } from "zod";

export const backupScheduleSchema = z
  .object({
    enabled: z.boolean(),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "invalid_backup_schedule_time"),
  })
  .strict();

export type BackupScheduleInput = z.infer<typeof backupScheduleSchema>;
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
