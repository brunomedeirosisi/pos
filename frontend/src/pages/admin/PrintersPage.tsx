import { formatDateTimeDdMmYyyy } from "../../utils/date";
import { useListQuery } from "../../hooks/useListQuery";
import { ListPagination } from "../../components/ui/Pagination";
import { http } from "../../api";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { printersService, type PrintPrinter } from "../../services/printers";
import { useToast } from "../../components/ui/ToastProvider";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
export function PrintersPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [revoking, setRevoking] = useState<PrintPrinter | null>(null);
  const info = useQuery({
    queryKey: ["printer-store-info"],
    queryFn: () => http.get<{ mode: string }>("/print-printers/info"),
  });
  const list = useListQuery<PrintPrinter>({
    queryKey: ["print-printers"],
    resource: "printers",
    refetchInterval: 10000,
  });
  const enrollment = useMutation({
    mutationFn: printersService.enroll,
    onError: (error: Error) => toast.show(error.message, "error"),
  });
  const revoke = useMutation({
    mutationFn: printersService.revoke,
    onSuccess: () => {
      setRevoking(null);
      void client.invalidateQueries({ queryKey: ["print-printers"] });
    },
    onError: (error: Error) => toast.show(error.message, "error"),
  });
  return (
    <div className="card">
      <h2>{t("printers.heading")}</h2>
      <p>{t("printers.enrollmentHelp")}</p>
      {(list.isError || info.isError) && (
        <p role="alert">
          {t("printers.loadError")}{" "}
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              void info.refetch();
              void list.refetch();
            }}
          >
            {t("common.retry")}
          </button>
        </p>
      )}
      {info.data?.mode === "direct" && (
        <p role="alert">{t("printers.queueRequired")}</p>
      )}
      <form
        className="form-grid vertical"
        onSubmit={(event) => {
          event.preventDefault();
          enrollment.mutate(name.trim());
        }}
      >
        <label>
          {t("printers.name")}
          <input
            value={name}
            maxLength={100}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className="button primary"
          disabled={
            enrollment.isPending || !name.trim() || info.data?.mode !== "queue"
          }
        >
          {t("printers.createCode")}
        </button>
      </form>
      {enrollment.data && (
        <section aria-live="polite">
          <p>{t("printers.codeHelp")}</p>
          <label>
            {t("printers.pairingCode")}
            <input
              readOnly
              value={enrollment.data.code}
              autoComplete="off"
              onFocus={(event) => event.target.select()}
            />
          </label>
          <p>
            {t("printers.expires")}:{" "}
            {formatDateTimeDdMmYyyy(enrollment.data.expires_at)}
          </p>
        </section>
      )}
      <table className="table">
        <thead>
          <tr>
            <th>{t("printers.name")}</th>
            <th>{t("common.status")}</th>
            <th>{t("common.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {list.data?.map((printer) => (
            <tr key={printer.id}>
              <td>{printer.display_name}</td>
              <td>
                {t(
                  !printer.enabled
                    ? "printers.revoked"
                    : printer.online
                      ? "printers.online"
                      : "printers.offline",
                )}
              </td>
              <td>
                {printer.id !== "principal" && printer.enabled && (
                  <button
                    type="button"
                    className="button danger"
                    onClick={() => setRevoking(printer)}
                  >
                    {t("printers.revoke")}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ListPagination query={list} />
      <ConfirmDialog
        open={Boolean(revoking)}
        title={t("printers.revoke")}
        description={t("printers.revokeHelp")}
        confirmLabel={t("printers.revoke")}
        onConfirm={() => {
          if (revoking) revoke.mutate(revoking.id);
        }}
        onClose={() => setRevoking(null)}
        isPending={revoke.isPending}
      />
    </div>
  );
}
