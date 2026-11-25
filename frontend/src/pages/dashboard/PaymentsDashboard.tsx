import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DateInput } from "../../components/ui/DateInput";
import { SearchableSelect } from "../../components/ui/SearchableSelect";
import { KpiCard } from "../../components/ui/KpiCard";
import { useListQuery, useListState } from "../../hooks/useListQuery";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { paymentAnalyticsService } from "../../services/payment-analytics";
import { formatCurrencyBrl } from "../../utils/number";
import {
  formatDateDdMmYyyy,
  formatDateTimeDdMmYyyy,
  hasValidDateFilters,
} from "../../utils/date";
import { ApiError } from "../../api";
import type {
  PaymentFilters,
  PaymentRanking,
  PaymentTransaction,
} from "../../types/payment-analytics";
import { PaymentCharts } from "./PaymentCharts";
import {
  PaymentRankingTable,
  PaymentTransactionsTable,
  type TableSort,
} from "./PaymentTables";

const filterKeys = [
  "startDate",
  "endDate",
  "timezone",
  "method",
  "origin",
  "customerId",
  "receivedBy",
  "storeId",
  "search",
] as const;
export function PaymentsDashboard(): JSX.Element {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const options = useQuery({
    queryKey: ["dashboard", "payments", "options"],
    queryFn: ({ signal }) => paymentAnalyticsService.options(signal),
    staleTime: 60_000,
    retry: false,
  });
  const filters = useMemo(() => {
    const result: PaymentFilters = {
      startDate:
        params.get("p_startDate") || options.data?.today.slice(0, 7) + "-01",
      endDate: params.get("p_endDate") || options.data?.today || "",
      timezone: params.get("p_timezone") || options.data?.timezone || "",
    };
    for (const key of filterKeys)
      if (params.get("p_" + key)) result[key] = params.get("p_" + key)!;
    if (!options.data && !params.get("p_startDate")) result.startDate = "";
    return result;
  }, [params, options.data]);
  const [draft, setDraft] = useState(filters);
  useEffect(() => setDraft(filters), [filters]);
  function apply(next: PaymentFilters) {
    const updated = new URLSearchParams(params);
    for (const key of filterKeys) {
      updated.delete("p_" + key);
      if (next[key]) updated.set("p_" + key, next[key]!);
    }
    setParams(updated, { replace: true });
  }
  useEffect(() => {
    if (
      options.data &&
      (!params.get("p_startDate") || !params.get("p_endDate"))
    )
      apply(filters);
  }, [options.data, params, filters]);
  const preference = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };
  const grouping = ["day", "week", "month"].includes(
    params.get("p_grouping") ?? "",
  )
    ? params.get("p_grouping")!
    : "day";
  const metric = params.get("p_metric") === "count" ? "count" : "gross";
  const compare = params.get("p_compare") === "true";
  const days =
    (Date.parse(filters.endDate) - Date.parse(filters.startDate)) / 86400000 +
    1;
  const valid = Boolean(
    options.data &&
    hasValidDateFilters({ ...filters }) &&
    days >= 1 &&
    days <= 366,
  );
  const draftDays =
    (Date.parse(draft.endDate) - Date.parse(draft.startDate)) / 86400000 + 1;
  const draftValid =
    hasValidDateFilters({ ...draft }) && draftDays >= 1 && draftDays <= 366;
  const summary = useQuery({
    queryKey: ["dashboard", "payments", "summary", filters, grouping],
    queryFn: ({ signal }) =>
      paymentAnalyticsService.summary(filters, grouping, signal),
    enabled: valid,
    staleTime: 15_000,
    refetchInterval: 60_000,
    retry: false,
  });
  const [transactionSort, setTransactionSort] = useListState<TableSort>(
    "dashboard-payment-transactions-sort",
    { sortBy: "date", sortOrder: "desc" },
  );
  const [customerSort, setCustomerSort] = useListState<TableSort>(
    "dashboard-payment-customers-sort",
    { sortBy: "net", sortOrder: "desc" },
  );
  const [employeeSort, setEmployeeSort] = useListState<TableSort>(
    "dashboard-payment-employees-sort",
    { sortBy: "net", sortOrder: "desc" },
  );
  const transactions = useListQuery<PaymentTransaction>({
    queryKey: [
      "dashboard",
      "payments",
      "transactions",
      filters,
      transactionSort,
    ],
    stateKey: "dashboard-payments-transactions",
    resource: "payment-transactions",
    filters: { ...filters, ...transactionSort },
    enabled: valid,
    refetchInterval: 60_000,
    fetchPage: paymentAnalyticsService.transactions,
  });
  const customers = useListQuery<PaymentRanking>({
    queryKey: ["dashboard", "payments", "customers", filters, customerSort],
    stateKey: "dashboard-payments-customers",
    resource: "payment-customers",
    filters: { ...filters, ...customerSort },
    enabled: valid,
    refetchInterval: 60_000,
    fetchPage: paymentAnalyticsService.customers,
  });
  const employees = useListQuery<PaymentRanking>({
    queryKey: ["dashboard", "payments", "employees", filters, employeeSort],
    stateKey: "dashboard-payments-employees",
    resource: "payment-employees",
    filters: { ...filters, ...employeeSort },
    enabled: valid,
    refetchInterval: 60_000,
    fetchPage: paymentAnalyticsService.employees,
  });
  const [exporting, setExporting] = useState(false),
    [exportError, setExportError] = useState("");
  const [search, setSearch] = useState(filters.search ?? "");
  const debouncedSearch = useDebouncedValue(search, 300);
  useEffect(() => setSearch(filters.search ?? ""), [filters.search]);
  useEffect(
    () =>
      setDraft((current) => ({
        ...current,
        search: debouncedSearch || undefined,
      })),
    [debouncedSearch],
  );
  async function download() {
    setExporting(true);
    setExportError("");
    try {
      const blob = await paymentAnalyticsService.export(
        { ...filters, ...transactionSort },
        i18n.language.startsWith("pt") ? "pt-BR" : "en",
      );
      const url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = "payments.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(
        t(
          error instanceof ApiError && error.status === 409
            ? "paymentsDashboard.exportLimit"
            : "paymentsDashboard.exportError",
        ),
      );
    } finally {
      setExporting(false);
    }
  }
  if (options.isPending)
    return (
      <p className="card" role="status">
        {t("common.loading")}
      </p>
    );
  if (options.isError)
    return (
      <div className="card" role="alert">
        {t("paymentsDashboard.loadError")}{" "}
        <button
          type="button"
          className="button"
          onClick={() => {
            void options.refetch();
          }}
        >
          {t("common.retry")}
        </button>
      </div>
    );
  const data = summary.data;
  const amount = (value?: number) =>
    value == null ? "—" : formatCurrencyBrl(value);
  const count = (value?: number) =>
    value == null ? "—" : value.toLocaleString(i18n.language);
  const position = data
    ? t("paymentsDashboard.positionScope", {
        date: formatDateTimeDdMmYyyy(
          data.position.asOf,
          "—",
          data.context.timezone,
        ),
      })
    : t("paymentsDashboard.positionGlobal");
  const change = data?.changePercentage;
  const delta = (value: number | null | undefined) =>
    value == null
      ? t("paymentsDashboard.noBaseline")
      : (value >= 0 ? "+" : "") +
        value.toLocaleString(i18n.language, { maximumFractionDigits: 2 }) +
        "%";
  const periodComparison = data
    ? `${formatDateDdMmYyyy(data.context.previousStart)} – ${formatDateDdMmYyyy(data.context.previousEnd)}: ${change == null ? t("paymentsDashboard.noBaseline") : (change >= 0 ? "+" : "") + change.toLocaleString(i18n.language, { maximumFractionDigits: 2 }) + "%"}`
    : undefined;
  const kpi = (key: string, value: string, subtitle?: string) => (
    <KpiCard
      key={key}
      label={t(`paymentsDashboard.kpis.${key}`)}
      value={value}
      tooltip={t(`paymentsDashboard.tips.${key}`)}
      subtitle={subtitle}
      isLoading={summary.isLoading}
    />
  );
  return (
    <div className="dashboard-exec payments-dashboard">
      <section className="card dashboard-filters">
        <div className="dashboard-filters__header">
          <h2>{t("paymentsDashboard.tab")}</h2>
          <div className="dashboard-widget__actions">
            <button
              type="button"
              className="button secondary"
              onClick={() =>
                apply({
                  startDate: options.data!.today.slice(0, 7) + "-01",
                  endDate: options.data!.today,
                  timezone: options.data!.timezone,
                })
              }
            >
              {t("common.reset")}
            </button>
            <button
              type="button"
              className="button primary"
              disabled={
                !draftValid || JSON.stringify(draft) === JSON.stringify(filters)
              }
              onClick={() => apply(draft)}
            >
              {t("common.apply")}
            </button>
          </div>
        </div>
        <p className="text-muted">
          {t("paymentsDashboard.timezone", { timezone: filters.timezone })}
        </p>
        <div className="dashboard-filters__grid">
          {(["startDate", "endDate"] as const).map((key) => (
            <div className="form-group" key={key}>
              <label htmlFor={"payment-" + key}>
                {t(`dashboard.filters.${key}`)}
              </label>
              <DateInput
                id={"payment-" + key}
                value={draft[key]}
                onValueChange={(value) =>
                  setDraft((current) => ({ ...current, [key]: value }))
                }
              />
            </div>
          ))}
          <div className="form-group">
            <label htmlFor="payment-method-filter">
              {t("paymentsDashboard.method")}
            </label>
            <select
              id="payment-method-filter"
              value={draft.method ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  method: event.target.value || undefined,
                }))
              }
            >
              <option value="">{t("pagination.allOptions")}</option>
              {["cash", "card", "bank", "other", "legacy", "unspecified"].map(
                (value) => (
                  <option key={value} value={value}>
                    {t(`paymentsDashboard.methods.${value}`)}
                  </option>
                ),
              )}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="payment-origin-filter">
              {t("paymentsDashboard.origin")}
            </label>
            <select
              id="payment-origin-filter"
              value={draft.origin ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  origin: event.target.value || undefined,
                }))
              }
            >
              <option value="">{t("pagination.allOptions")}</option>
              {["cash_sale", "credit_entry", "debt_payment"].map((value) => (
                <option key={value} value={value}>
                  {t(`paymentsDashboard.originsList.${value}`)}
                </option>
              ))}
            </select>
          </div>
          {(
            [
              ["customerId", "customers", "customers.heading"],
              [
                "receivedBy",
                "dashboard-payment-users",
                "paymentsDashboard.employee",
              ],
              [
                "storeId",
                "dashboard-payment-stores",
                "dashboard.filters.store",
              ],
            ] as const
          ).map(([key, resource, label]) => (
            <div className="form-group" key={key}>
              <label id={`payment-${key}-label`} htmlFor={`payment-${key}`}>
                {t(label)}
              </label>
              <SearchableSelect
                id={`payment-${key}`}
                resource={resource}
                value={draft[key] ?? ""}
                options={
                  draft.receivedBy === "unassigned"
                    ? [
                        {
                          value: "unassigned",
                          label: t("paymentsDashboard.unassignedEmployee"),
                        },
                      ]
                    : []
                }
                disabled={
                  key === "receivedBy" && draft.receivedBy === "unassigned"
                }
                emptyLabel={t("pagination.allOptions")}
                onChange={(option) =>
                  setDraft((current) => ({
                    ...current,
                    [key]: option.value || undefined,
                  }))
                }
              />
              {key === "receivedBy" && (
                <label>
                  <input
                    type="checkbox"
                    checked={draft.receivedBy === "unassigned"}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        receivedBy: event.target.checked
                          ? "unassigned"
                          : undefined,
                      }))
                    }
                  />
                  {t("paymentsDashboard.onlyUnassigned")}
                </label>
              )}
            </div>
          ))}
          <div className="form-group">
            <label htmlFor="payment-search">
              {t("paymentsDashboard.search")}
            </label>
            <input
              id="payment-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        {!draftValid && (
          <p role="alert">{t("paymentsDashboard.invalidRange")}</p>
        )}
      </section>
      {!valid ? (
        <p role="alert">{t("paymentsDashboard.invalidRange")}</p>
      ) : (
        <>
          {summary.isError && (
            <div className="card" role="alert">
              {t("paymentsDashboard.loadError")}{" "}
              <button
                type="button"
                className="button"
                onClick={() => {
                  void summary.refetch();
                }}
              >
                {t("common.retry")}
              </button>
            </div>
          )}
          <section
            className="dashboard-kpis"
            aria-label={t("paymentsDashboard.mainKpis")}
          >
            {kpi(
              "today",
              amount(data?.today.net),
              t("paymentsDashboard.todayScope") +
                (data ? " · " + delta(data.todayChangePercentage) : ""),
            )}
            {kpi("period", amount(data?.current.net), periodComparison)}
            {kpi(
              "ticket",
              amount(data?.current.average),
              data ? delta(data.averageChangePercentage) : undefined,
            )}
            {kpi("receivable", amount(data?.position.total), position)}
            {kpi(
              "delinquency",
              t("paymentsDashboard.unavailable"),
              t("paymentsDashboard.noDueDates"),
            )}
          </section>
          <p className="card text-muted">
            {position} · {t("paymentsDashboard.positionDetailsUnavailable")}
          </p>
          <PaymentCharts
            data={data}
            state={summary}
            grouping={grouping}
            setGrouping={(value) => preference("p_grouping", value)}
            compare={compare}
            setCompare={(value) => preference("p_compare", String(value))}
            metric={metric}
            setMetric={(value) => preference("p_metric", value)}
            onMethod={(method) => apply({ ...filters, method })}
          />
          <div className="dashboard-grid-two">
            <PaymentRankingTable
              kind="customers"
              query={customers}
              sort={customerSort}
              setSort={setCustomerSort}
            />
            <PaymentRankingTable
              kind="employees"
              query={employees}
              sort={employeeSort}
              setSort={setEmployeeSort}
            />
          </div>
          <section
            className="dashboard-kpis"
            aria-label={t("paymentsDashboard.secondaryKpis")}
          >
            {kpi("quantity", count(data?.current.count))}
            {kpi("amortization", amount(data?.current.averageAmortization))}
            {kpi("debtors", count(data?.position.debtorCount), position)}
            {kpi(
              "settled",
              t("paymentsDashboard.unavailable"),
              t("paymentsDashboard.noAllocation"),
            )}
            {kpi(
              "debtShare",
              data
                ? data.current.debtPercentage.toLocaleString(i18n.language, {
                    maximumFractionDigits: 2,
                  }) + "%"
                : "—",
            )}
          </section>
          {data && (
            <aside className="card payment-coverage">
              <h3>{t("paymentsDashboard.coverage")}</h3>
              <p>
                {t("paymentsDashboard.coverageCounts", {
                  employee: data.coverage.unknownEmployee,
                  store: data.coverage.unknownStore,
                  method: data.coverage.unknownMethod,
                })}
              </p>
              <p>{t("paymentsDashboard.legacyScope")}</p>
              {data.coverage.undatedReversals > 0 && (
                <p role="alert">
                  {t("paymentsDashboard.undatedReversals", {
                    count: data.coverage.undatedReversals,
                  })}
                </p>
              )}
            </aside>
          )}
          <PaymentTransactionsTable
            query={transactions}
            sort={transactionSort}
            setSort={setTransactionSort}
            exporting={exporting}
            onExport={() => {
              void download();
            }}
            exportError={exportError}
          />
        </>
      )}
    </div>
  );
}
