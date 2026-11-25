import React from "react";
import { useTranslation } from "react-i18next";
import { KpiCard } from "../../../components/ui/KpiCard";
import { formatCurrencyBrl } from "../../../utils/number";
import type { CustomerOverview } from "../../../types/catalog";

export function CustomerPortfolioKpis({
  data,
  isLoading,
  isError,
  isFetching,
  canViewFinancials,
  onRetry,
}: {
  data?: CustomerOverview;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  canViewFinancials: boolean;
  onRetry: () => void;
}) {
  const { t, i18n } = useTranslation();
  const financial = canViewFinancials ? data?.financial : undefined;
  const count = (value?: number) =>
    value == null ? "—" : value.toLocaleString(i18n.language);
  const money = (value?: number) =>
    value == null ? "—" : formatCurrencyBrl(value);
  return (
    <section
      className="customer-portfolio"
      aria-label={t("customerPortfolio.indicators")}
      aria-busy={isFetching}
    >
      <p className="text-muted">{t("customerPortfolio.globalScope")}</p>
      {isError && (
        <div role="alert" className="empty-state">
          {t("customerPortfolio.loadError")}{" "}
          <button
            type="button"
            className="button secondary"
            disabled={isFetching}
            onClick={onRetry}
          >
            {t("common.retry")}
          </button>
        </div>
      )}
      {isLoading && (
        <p className="sr-only" role="status">
          {t("common.loading")}
        </p>
      )}
      <div className="dashboard-kpis">
        <KpiCard
          label={t("customerPortfolio.totalCustomers")}
          value={count(data?.total_customers)}
          isLoading={isLoading}
        />
        {canViewFinancials && (
          <>
            <KpiCard
              label={t("customerPortfolio.customersWithDebt")}
              value={count(financial?.customers_with_debt)}
              isLoading={isLoading}
            />
            <KpiCard
              label={t("customerPortfolio.totalDebt")}
              value={money(financial?.total_debt)}
              isLoading={isLoading}
            />
            <KpiCard
              label={t("customerPortfolio.customersWithoutDebt")}
              value={count(financial?.customers_without_debt)}
              subtitle={t("customerPortfolio.zeroBalanceOnly")}
              isLoading={isLoading}
            />
            <KpiCard
              label={t("customerPortfolio.debtPercentage")}
              value={
                financial
                  ? new Intl.NumberFormat(i18n.language, {
                      style: "percent",
                      maximumFractionDigits: 2,
                    }).format(financial.debt_percentage / 100)
                  : "—"
              }
              isLoading={isLoading}
            />
            <KpiCard
              label={t("customerPortfolio.averageDebt")}
              value={money(financial?.average_debt)}
              isLoading={isLoading}
            />
            <KpiCard
              label={t("customerPortfolio.largestDebt")}
              value={money(financial?.largest_debt)}
              isLoading={isLoading}
            />
            <KpiCard
              label={t("customerPortfolio.customersWithCredit")}
              value={count(financial?.customers_with_credit)}
              subtitle={
                financial
                  ? t("customerPortfolio.creditTotal", {
                      amount: money(financial.total_credit),
                    })
                  : undefined
              }
              isLoading={isLoading}
            />
          </>
        )}
      </div>
      {data?.total_customers === 0 && !isLoading && !isError && (
        <p role="status">{t("customerPortfolio.empty")}</p>
      )}
      {canViewFinancials && (
        <p className="text-muted">{t("customerPortfolio.debtNotice")}</p>
      )}
    </section>
  );
}
