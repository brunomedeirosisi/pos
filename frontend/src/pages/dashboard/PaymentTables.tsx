import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { WidgetFrame } from "../../components/ui/DashboardWidget";
import { ListPagination } from "../../components/ui/Pagination";
import { useHasPermission } from "../../store/auth";
import { formatCurrencyBrl } from "../../utils/number";
import { formatDateDdMmYyyy } from "../../utils/date";
import type { ListControls } from "../../hooks/useListQuery";
import type {
  PaymentRanking,
  PaymentTransaction,
} from "../../types/payment-analytics";

type TableState<T> = ListControls & { data?: T[]; isLoading: boolean };
export type TableSort = { sortBy: string; sortOrder: "asc" | "desc" };
export function PaymentRankingTable({
  kind,
  query,
  sort,
  setSort,
}: {
  kind: "customers" | "employees";
  query: TableState<PaymentRanking>;
  sort: TableSort;
  setSort: (value: TableSort) => void;
}) {
  const { t } = useTranslation();
  const canReadCustomers = useHasPermission("catalog:read");
  const header = (key: string, label: string) => (
    <th
      aria-sort={
        sort.sortBy === key
          ? sort.sortOrder === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button
        type="button"
        className="payment-sort"
        onClick={() =>
          setSort({
            sortBy: key,
            sortOrder:
              sort.sortBy === key && sort.sortOrder === "desc" ? "asc" : "desc",
          })
        }
      >
        {label}
      </button>
    </th>
  );
  return (
    <WidgetFrame
      title={t(`paymentsDashboard.${kind}Ranking`)}
      state={query}
      loadingText={t("common.loading")}
      errorText={t("paymentsDashboard.loadError")}
    >
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              {header(
                "name",
                t(
                  kind === "customers"
                    ? "customers.heading"
                    : "paymentsDashboard.employee",
                ),
              )}
              {header("net", t("paymentsDashboard.net"))}
              {header("count", t("paymentsDashboard.quantity"))}
              {header("average", t("paymentsDashboard.ticket"))}
              {kind === "customers" ? (
                <>
                  {header("last_date", t("customers.lastPayment"))}
                  <th>{t("customers.currentBalance")}</th>
                </>
              ) : (
                <th>{t("dashboard.table.participation")}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {(query.data ?? []).map((row, index) => (
              <tr key={row.id}>
                <td>
                  {((query.pagination?.page ?? 1) - 1) *
                    (query.pagination?.pageSize ?? 25) +
                    index +
                    1}
                </td>
                <td>
                  {kind === "customers" && row.entity_id && canReadCustomers ? (
                    <Link to={`/catalog/customers/${row.entity_id}`}>
                      {row.name}
                    </Link>
                  ) : (
                    (row.name ??
                    t(
                      kind === "customers"
                        ? "paymentsDashboard.unidentifiedCustomer"
                        : "paymentsDashboard.unassignedEmployee",
                    ))
                  )}
                </td>
                <td
                  title={`${t("paymentsDashboard.gross")}: ${formatCurrencyBrl(row.gross)} · ${t("paymentsDashboard.refunds")}: ${formatCurrencyBrl(row.refunds)}`}
                >
                  {formatCurrencyBrl(row.net)}
                </td>
                <td>{row.count}</td>
                <td>{formatCurrencyBrl(row.average)}</td>
                {kind === "customers" ? (
                  <>
                    <td>{formatDateDdMmYyyy(row.last_date)}</td>
                    <td>
                      {row.current_balance == null
                        ? "—"
                        : formatCurrencyBrl(row.current_balance)}
                    </td>
                  </>
                ) : (
                  <td>{row.participation.toFixed(2)}%</td>
                )}
              </tr>
            ))}
            {query.data?.length === 0 && (
              <tr>
                <td colSpan={kind === "customers" ? 7 : 6}>
                  {t("common.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-muted">
        {t(
          kind === "customers"
            ? "paymentsDashboard.customerRankingScope"
            : "paymentsDashboard.employeeRankingScope",
        )}
      </p>
      <ListPagination query={query} />
    </WidgetFrame>
  );
}
export function PaymentTransactionsTable({
  query,
  sort,
  setSort,
  exporting,
  onExport,
  exportError,
}: {
  query: TableState<PaymentTransaction>;
  sort: TableSort;
  setSort: (value: TableSort) => void;
  exporting: boolean;
  onExport: () => void;
  exportError: string;
}) {
  const { t } = useTranslation(),
    canSales = useHasPermission("sales:read"),
    canCustomers = useHasPermission("catalog:read");
  const headers = [
    ["date", "dashboard.table.date"],
    ["id", "paymentsDashboard.identifier"],
    ["kind", "paymentsDashboard.event"],
    ["customer", "customers.heading"],
    ["employee", "paymentsDashboard.employee"],
    ["origin", "paymentsDashboard.origin"],
    ["method", "paymentsDashboard.method"],
    ["amount", "paymentsDashboard.net"],
  ] as const;
  return (
    <WidgetFrame
      title={t("paymentsDashboard.transactions")}
      state={query}
      loadingText={t("common.loading")}
      errorText={t("paymentsDashboard.loadError")}
      actions={
        <button
          type="button"
          className="button secondary"
          disabled={exporting || query.isFetching || query.isError}
          onClick={onExport}
        >
          {exporting ? t("common.loading") : t("paymentsDashboard.export")}
        </button>
      }
    >
      {exportError && <p role="alert">{exportError}</p>}
      <p className="text-muted">{t("paymentsDashboard.transactionsScope")}</p>
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              {headers.map(([key, label]) => (
                <th
                  key={key}
                  aria-sort={
                    sort.sortBy === key
                      ? sort.sortOrder === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    className="payment-sort"
                    onClick={() =>
                      setSort({
                        sortBy: key,
                        sortOrder:
                          sort.sortBy === key && sort.sortOrder === "desc"
                            ? "asc"
                            : "desc",
                      })
                    }
                  >
                    {t(label)}
                  </button>
                </th>
              ))}
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {(query.data ?? []).map((row) => (
              <tr key={row.id}>
                <td>{formatDateDdMmYyyy(row.event_date)}</td>
                <td>
                  <small>{row.source_id}</small>
                  {row.reference && <small>{row.reference}</small>}
                </td>
                <td>
                  {t(`paymentsDashboard.events.${row.kind}`)}
                  {row.kind === "receipt" && row.reversed && (
                    <small>{t("paymentsDashboard.reversedLater")}</small>
                  )}
                </td>
                <td>
                  {row.customer_name ??
                    t("paymentsDashboard.unidentifiedCustomer")}
                </td>
                <td>
                  {row.receiver_name ??
                    t("paymentsDashboard.unassignedEmployee")}
                </td>
                <td>{t(`paymentsDashboard.originsList.${row.origin}`)}</td>
                <td>{t(`paymentsDashboard.methods.${row.method}`)}</td>
                <td>{formatCurrencyBrl(row.net)}</td>
                <td>
                  <div className="table-actions">
                    {row.source_type === "sale" && canSales && (
                      <>
                        <Link to={`/sales/${row.source_id}`}>
                          {t("common.details")}
                        </Link>
                        <Link to={`/sales/${row.source_id}/receipt`}>
                          {t("sales.printReceipt")}
                        </Link>
                      </>
                    )}
                    {row.source_type === "customer_payment" && canCustomers && (
                      <>
                        <Link to={`/payments/${row.source_id}`}>
                          {t("paymentHistory.viewPayment")}
                        </Link>
                        {row.customer_id && (
                          <Link
                            to={`/catalog/customers/${row.customer_id}/payments/${row.source_id}/receipt`}
                          >
                            {t("sales.printReceipt")}
                          </Link>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {query.data?.length === 0 && (
              <tr>
                <td colSpan={9}>{t("common.empty")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <ListPagination query={query} />
    </WidgetFrame>
  );
}
