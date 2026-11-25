import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { WidgetFrame } from "../../components/ui/DashboardWidget";
import {
  chartPalette,
  renderLinePoints,
  getHeatColor,
} from "../../components/ui/dashboard-charts";
import { useClientPage } from "../../hooks/useClientPage";
import { ListPagination } from "../../components/ui/Pagination";
import { formatCurrencyBrl } from "../../utils/number";
import { formatDateDdMmYyyy } from "../../utils/date";
import type { PaymentSummary } from "../../types/payment-analytics";

type State = {
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => unknown;
};
export function PaymentCharts({
  data,
  state,
  grouping,
  setGrouping,
  compare,
  setCompare,
  metric,
  setMetric,
  onMethod,
}: {
  data?: PaymentSummary;
  state: State;
  grouping: string;
  setGrouping: (value: string) => void;
  compare: boolean;
  setCompare: (value: boolean) => void;
  metric: "gross" | "count";
  setMetric: (value: "gross" | "count") => void;
  onMethod: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [showAllMethods, setShowAllMethods] = useState(false);
  const series = data?.series ?? [],
    page = useClientPage("dashboard-payment-series", series, {
      grouping,
      start: data?.context.startDate,
      end: data?.context.endDate,
    });
  const common = {
    state,
    loadingText: t("common.loading"),
    errorText: t("paymentsDashboard.loadError"),
  };
  const money = formatCurrencyBrl;
  const number = (value: number) =>
    metric === "gross" ? money(value) : String(value);
  const methods = data?.methods ?? [],
    total = methods.reduce((sum, row) => sum + row[metric], 0);
  const major = showAllMethods
    ? methods
    : methods.filter((row) => total === 0 || row[metric] / total >= 0.02);
  const small = showAllMethods
    ? []
    : methods.filter((row) => total > 0 && row[metric] / total < 0.02);
  const chartMethods = [
    ...major,
    ...(small.length
      ? [
          {
            key: "small_methods",
            gross: small.reduce((sum, row) => sum + row.gross, 0),
            count: small.reduce((sum, row) => sum + row.count, 0),
            net: small.reduce((sum, row) => sum + row.net, 0),
            refunds: small.reduce((sum, row) => sum + row.refunds, 0),
          },
        ]
      : []),
  ];
  let pointer = 0;
  const gradient = chartMethods
    .map((row, index) => {
      const start = pointer;
      pointer += total ? (row[metric] / total) * 360 : 0;
      return `${chartPalette[index % chartPalette.length]} ${start}deg ${pointer}deg`;
    })
    .join(",");
  const originTotal = (data?.origins ?? []).reduce(
    (sum, row) => sum + row.gross,
    0,
  );
  const boundValues = series.flatMap((row) => [
    row.gross,
    row.refunds,
    row.net,
    ...(compare ? [row.previousNet] : []),
  ]);
  const bounds = {
    min: Math.min(0, ...boundValues),
    max: Math.max(1, ...boundValues),
  };
  const netPoints=renderLinePoints(series.map(item=>item.net),680,220,20,bounds).split(' ');
  const heat = new Map(
    (data?.heatmap ?? []).map((row) => [`${row.weekday}-${row.hour}`, row]),
  );
  const maxHeat = Math.max(
    0,
    ...(data?.heatmap ?? []).map((row) => row[metric]),
  );
  const methodLabel = (key: string) =>
    key === "small_methods"
      ? t("paymentsDashboard.smallMethods")
      : t(`paymentsDashboard.methods.${key}`);
  const metricControl = (
    <select
      aria-label={t("paymentsDashboard.distributionMetric")}
      value={metric}
      onChange={(event) => setMetric(event.target.value as "gross" | "count")}
    >
      <option value="gross">{t("paymentsDashboard.gross")}</option>
      <option value="count">{t("paymentsDashboard.quantity")}</option>
    </select>
  );
  return (
    <>
      <div className="dashboard-grid-two">
        <WidgetFrame
          {...common}
          title={t("paymentsDashboard.evolution")}
          actions={
            <>
              <select
                aria-label={t("paymentsDashboard.grouping")}
                value={grouping}
                onChange={(event) => setGrouping(event.target.value)}
              >
                {["day", "week", "month"].map((value) => (
                  <option key={value} value={value}>
                    {t(`paymentsDashboard.groups.${value}`)}
                  </option>
                ))}
              </select>
              <label>
                <input
                  type="checkbox"
                  checked={compare}
                  onChange={(event) => setCompare(event.target.checked)}
                />
                {t("dashboard.widgets.comparePrevious")}
              </label>
            </>
          }
        >
          <div className="dashboard-line-chart">
            <div className="dashboard-line-chart__legend">
              {[
                "gross",
                "refunds",
                "net",
                ...(compare ? ["previousNet"] : []),
              ].map((key, index) => (
                <span key={key} style={{ color: chartPalette[index] }}>
                  {t(`paymentsDashboard.${key}`)}
                </span>
              ))}
            </div>
            <svg
              viewBox="0 0 680 220"
              role="img"
              aria-label={t("paymentsDashboard.evolution")}
            >
              {(
                [
                  "gross",
                  "refunds",
                  "net",
                  ...(compare ? ["previousNet" as const] : []),
                ] as const
              ).map((key, index) => (
                <polyline
                  key={key}
                  fill="none"
                  stroke={chartPalette[index]}
                  strokeWidth="2.5"
                  strokeDasharray={key === "previousNet" ? "4 4" : undefined}
                  points={renderLinePoints(
                    series.map((row) => row[key]),
                    680,
                    220,
                    20,
                    bounds,
                  )}
                />
              ))}
              {series.map((row, index) => {
                const [x, y] = netPoints[index].split(",");
                return (
                  <circle
                    key={row.date}
                    cx={x}
                    cy={y}
                    r="4"
                    fill={chartPalette[2]}
                  >
                    <title>{`${formatDateDdMmYyyy(row.date)}: ${t("paymentsDashboard.gross")} ${money(row.gross)}; ${t("paymentsDashboard.refunds")} ${money(row.refunds)}; ${t("paymentsDashboard.net")} ${money(row.net)}; ${t("paymentsDashboard.quantity")} ${row.count}`}</title>
                  </circle>
                );
              })}
            </svg>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("dashboard.table.date")}</th>
                    {[
                      "gross",
                      "refunds",
                      "net",
                      ...(compare ? ["previousNet"] : []),
                    ].map((key) => (
                      <th key={key}>{t(`paymentsDashboard.${key}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((row) => (
                    <tr key={row.date}>
                      <td>{formatDateDdMmYyyy(row.date)}</td>
                      <td>{money(row.gross)}</td>
                      <td>{money(row.refunds)}</td>
                      <td>{money(row.net)}</td>
                      {compare && <td>{money(row.previousNet)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListPagination query={page.controls} />
          </div>
        </WidgetFrame>
        <WidgetFrame
          {...common}
          title={t("paymentsDashboard.distribution")}
          actions={metricControl}
        >
          <p className="text-muted">
            {t("paymentsDashboard.distributionScope")}
          </p>
          {total === 0 ? (
            <p className="empty-state">{t("common.empty")}</p>
          ) : (
            <div className="dashboard-categories">
              <div
                className="dashboard-categories__donut"
                role="img"
                aria-label={t("paymentsDashboard.distribution")}
                style={{ background: `conic-gradient(${gradient})` }}
              />
              <ul className="dashboard-categories__legend">
                {chartMethods.map((row, index) => (
                  <li key={row.key}>
                    <button
                      type="button"
                      className="payment-drill"
                      onClick={() =>
                        row.key === "small_methods"
                          ? setShowAllMethods(true)
                          : onMethod(row.key)
                      }
                      title={`${t("paymentsDashboard.net")}: ${money(row.net)}; ${t("paymentsDashboard.refunds")}: ${money(row.refunds)}`}
                    >
                      <span
                        style={{
                          color: chartPalette[index % chartPalette.length],
                        }}
                      >
                        ●{" "}
                      </span>
                      {methodLabel(row.key)}: {number(row[metric])} (
                      {((row[metric] / total) * 100).toFixed(2)}%)
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </WidgetFrame>
        <WidgetFrame {...common} title={t("paymentsDashboard.origins")}>
          {(data?.origins ?? []).map((row) => (
            <div className="payment-origin" key={row.key}>
              <span>{t(`paymentsDashboard.originsList.${row.key}`)}</span>
              <strong>
                {money(row.gross)} (
                {originTotal
                  ? ((row.gross / originTotal) * 100).toFixed(2)
                  : "0"}
                %)
              </strong>
              <div
                className="payment-origin__bar"
                role="img"
                aria-label={`${t(`paymentsDashboard.originsList.${row.key}`)} ${money(row.gross)}`}
              >
                <span
                  style={{
                    width: `${originTotal ? (row.gross / originTotal) * 100 : 0}%`,
                  }}
                />
              </div>
              <small>
                {t("paymentsDashboard.net")}: {money(row.net)} ·{" "}
                {t("paymentsDashboard.refunds")}: {money(row.refunds)}
              </small>
            </div>
          ))}
          {data?.origins.length === 0 && <p>{t("common.empty")}</p>}
        </WidgetFrame>
        <WidgetFrame
          {...common}
          title={t("paymentsDashboard.heatmap")}
          actions={metricControl}
        >
          <p className="text-muted">
            {t("paymentsDashboard.unknownTimes", {
              count: data?.coverage.unknownTime ?? 0,
            })}
          </p>
          <div className="dashboard-heatmap">
            <div className="dashboard-heatmap__header">
              <span>{t("dashboard.table.weekday")}</span>
              {Array.from({ length: 24 }, (_, hour) => (
                <span key={hour}>{hour}</span>
              ))}
            </div>
            {Array.from({ length: 7 }, (_, day) => (
              <div key={day} className="dashboard-heatmap__row">
                <span className="dashboard-heatmap__label">
                  {t(`dashboard.weekdays.${day + 1}`)}
                </span>
                {Array.from({ length: 24 }, (_, hour) => {
                  const row = heat.get(`${day + 1}-${hour}`),
                    label = `${t(`dashboard.weekdays.${day + 1}`)} ${hour}h: ${row ? `${money(row.gross)} · ${row.count}` : t("paymentsDashboard.noObservations")}`;
                  return (
                    <span
                      key={hour}
                      className="dashboard-heatmap__cell"
                      tabIndex={0}
                      role="img"
                      aria-label={label}
                      title={label}
                      style={{
                        background: getHeatColor(row?.[metric] ?? 0, maxHeat),
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </WidgetFrame>
      </div>
      <div className="dashboard-grid-two">
        {["receivablesEvolution", "aging"].map((key) => (
          <WidgetFrame
            key={key}
            {...common}
            title={t(`paymentsDashboard.${key}`)}
          >
            <p className="payment-unavailable">
              {t("paymentsDashboard.unavailable")}
            </p>
            <p>{t(`paymentsDashboard.${key}Unavailable`)}</p>
          </WidgetFrame>
        ))}
      </div>
    </>
  );
}
