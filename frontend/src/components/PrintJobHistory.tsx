import { useListQuery } from "../hooks/useListQuery";
import { ListPagination } from "./ui/Pagination";
import type { PrintJob } from "../types/sales";

import { useTranslation } from "react-i18next";

export function PrintJobHistory({ saleId }: { saleId: string }) {
  const { t } = useTranslation();
  const jobs = useListQuery<PrintJob>({
    queryKey: ["sale-print-jobs", saleId],
    resource: "print-jobs",
    filters: { saleId },
    stateKey: `sale-${saleId}-prints`,
    refetchInterval: 3000,
  });
  if (jobs.isSuccess && !jobs.data?.length) return null;
  return (
    <section
      aria-label={t("sales.printJobs")}
      className="card"
      aria-live="polite"
    >
      <h2>{t("sales.printJobs")}</h2>
      <ul>
        {jobs.data?.map((job) => (
          <li key={job.job_id}>
            {job.receipt_code} — {job.printer_name} —{" "}
            {t("sales.printStatus." + job.status)} ({job.copies})
            {job.status === "uncertain" && (
              <p>{t("sales.printUncertainHelp")}</p>
            )}
          </li>
        ))}
      </ul>
      <ListPagination query={jobs} />
    </section>
  );
}
