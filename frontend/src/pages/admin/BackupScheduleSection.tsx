import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { backupService } from "../../services/backup";
import type { BackupExecution, BackupScheduleInput } from "../../types/backup";
import { useHasPermission } from "../../store/auth";
import { useToast } from "../../components/ui/ToastProvider";
import { TimeInput, isValidTime } from "../../components/ui/TimeInput";
import { ListPagination } from "../../components/ui/Pagination";
import { useListQuery } from "../../hooks/useListQuery";
import { formatDateTimeDdMmYyyy } from "../../utils/date";

export function BackupScheduleSection({
  restoring,
}: {
  restoring: boolean;
}): JSX.Element {
  const { t } = useTranslation(),
    toast = useToast(),
    client = useQueryClient();
  const canManage = useHasPermission("system:backup:schedule");
  const [draft, setDraft] = useState<BackupScheduleInput | null>(null);
  const schedule = useQuery({
    queryKey: ["admin", "backup-schedule"],
    queryFn: backupService.schedule,
    refetchInterval: 15000,
  });
  const history = useListQuery<BackupExecution>({
    queryKey: ["admin", "backup-executions"],
    resource: "backup-executions",
    refetchInterval: 15000,
  });
  const save = useMutation({
    mutationFn: backupService.saveSchedule,
    onSuccess: (result) => {
      client.setQueryData(["admin", "backup-schedule"], result);
      setDraft(null);
      toast.show(t("backupSchedule.saved"), "success");
    },
    onError: (error: Error) => toast.show(error.message, "error"),
  });
  const value = draft ?? schedule.data;
  const disabled = !canManage || restoring || save.isPending;
  const date = (value: string | null) =>
    formatDateTimeDdMmYyyy(value, "-", schedule.data?.timezone);
  const errorText = (error: string) =>
    ["automatic_backup_interrupted", "backup_interrupted"].includes(error)
      ? t("backupSchedule.interrupted")
      : error;
  return (
    <section className="card">
      <h3>{t("backupSchedule.title")}</h3>
      {schedule.isPending ? (
        <p>{t("common.loading")}</p>
      ) : schedule.isError ? (
        <div role="alert">
          <p>{t("backupSchedule.loadError")}</p>
          <button
            type="button"
            className="button secondary"
            onClick={() => void schedule.refetch()}
          >
            {t("common.retry")}
          </button>
        </div>
      ) : (
        value && (
          <>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (isValidTime(value.time))
                  save.mutate({ enabled: value.enabled, time: value.time });
              }}
            >
              <div className="form-group">
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={value.enabled}
                    disabled={disabled}
                    onChange={(e) =>
                      setDraft({
                        enabled: e.target.checked,
                        time: isValidTime(value.time)
                          ? value.time
                          : schedule.data!.time,
                      })
                    }
                    style={{ width: "auto" }}
                  />
                  {t("backupSchedule.enable")}
                </label>
                <small className="text-muted">
                  {t(
                    schedule.data!.enabled
                      ? "backupSchedule.enabled"
                      : "backupSchedule.disabled",
                  )}
                </small>
              </div>
              <div className="form-group" style={{ maxWidth: "320px" }}>
                <label htmlFor="backup-schedule-time">
                  {t("backupSchedule.time")}
                </label>
                <TimeInput
                  id="backup-schedule-time"
                  value={value.time}
                  required
                  disabled={disabled || !value.enabled}
                  onValueChange={(time) =>
                    setDraft({ enabled: value.enabled, time })
                  }
                />
                {value.time && !isValidTime(value.time) && (
                  <small role="alert">{t("backupSchedule.invalidTime")}</small>
                )}
              </div>
              <p className="text-muted">
                {t("backupSchedule.timezone", {
                  timezone: schedule.data!.timezone,
                })}
              </p>
              <p>
                {t("backupSchedule.nextRun")}:{" "}
                <strong>
                  {schedule.data!.enabled
                    ? date(schedule.data!.nextRunAt)
                    : t("backupSchedule.notScheduled")}
                </strong>
              </p>
              {canManage && (
                <button
                  type="submit"
                  className="button primary"
                  disabled={disabled || !draft || !isValidTime(value.time)}
                >
                  {save.isPending ? t("common.loading") : t("common.save")}
                </button>
              )}
              {draft && (
                <p className="text-muted">{t("backupSchedule.unsaved")}</p>
              )}
            </form>
            <p className="text-muted">{t("backupSchedule.catchUp")}</p>
            <div aria-live="polite">
              <strong>{t("backupSchedule.lastRun")}: </strong>
              {schedule.data!.lastRun ? (
                <>
                  {date(schedule.data!.lastRun.startedAt)} —{" "}
                  {t("backupSchedule.status." + schedule.data!.lastRun.status)}
                  {schedule.data!.lastRun.errorMessage && (
                    <p role="alert">
                      {errorText(schedule.data!.lastRun.errorMessage)}
                    </p>
                  )}
                </>
              ) : (
                t("backupSchedule.never")
              )}
            </div>
          </>
        )
      )}
      <details>
      <summary style={{cursor:"pointer",marginTop:"1rem"}}>{t("backupSchedule.history")}</summary>
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>{t("backups.createdAt")}</th>
              <th>{t("backupSchedule.type")}</th>
              <th>{t("common.status")}</th>
              <th>{t("backupSchedule.result")}</th>
            </tr>
          </thead>
          <tbody>
            {history.isLoading ? (
              <tr>
                <td colSpan={4}>{t("common.loading")}</td>
              </tr>
            ) : history.isError ? (
              <tr>
                <td colSpan={4} role="alert">
                  {(history.error as Error).message}
                </td>
              </tr>
            ) : !history.data?.length ? (
              <tr>
                <td colSpan={4}>{t("common.empty")}</td>
              </tr>
            ) : (
              history.data.map((run) => (
                <tr key={run.id}>
                  <td>
                    {date(run.startedAt)}
                    {run.scheduledFor && (
                      <small
                        className="text-muted"
                        style={{ display: "block" }}
                      >
                        {t("backupSchedule.scheduledFor", {
                          date: date(run.scheduledFor),
                        })}
                      </small>
                    )}
                  </td>
                  <td>{t("backupSchedule.types." + run.type)}</td>
                  <td>{t("backupSchedule.status." + run.status)}</td>
                  <td>
                    {run.filename ?? "-"}
                    {run.errorMessage && <p>{errorText(run.errorMessage)}</p>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <ListPagination query={history} />
      </details>
    </section>
  );
}
