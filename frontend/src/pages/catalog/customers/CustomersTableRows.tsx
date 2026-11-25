import React from "react";
import type { TFunction } from "i18next";
import type {
  Customer,
  CustomerListItem,
  CustomerStatus,
} from "../../../types/catalog";
import { formatCurrencyBrl } from "../../../utils/number";

const statusClasses: Record<CustomerStatus, string> = {
  active: "status-completed",
  delinquent: "status-cancelled",
  inactive: "status-draft",
};

type CustomersTableRowsProps = {
  customers: CustomerListItem[];
  canViewFinancials: boolean;
  canReadCatalog: boolean;
  canWriteCatalog: boolean;
  isLoading: boolean;
  isError: boolean;
  error?: Error;
  t: TFunction;
  onOpenDetails: (customerId: string) => void;
  onEdit: (record: Customer) => void;
};

export function CustomersTableRows(
  props: CustomersTableRowsProps,
): JSX.Element {
  const {
    customers,
    canReadCatalog,
    canWriteCatalog,
    canViewFinancials,
    isLoading,
    isError,
    error,
    t,
    onOpenDetails,
    onEdit,
  } = props;
  const columnCount = canViewFinancials ? 8 : 7;

  if (!canReadCatalog) {
    return (
      <tr>
        <td colSpan={columnCount}>
          <div className="empty-state">{t("common.noPermission")}</div>
        </td>
      </tr>
    );
  }

  if (isLoading) {
    return (
      <tr>
        <td colSpan={columnCount}>
          <div className="empty-state">{t("common.loading")}</div>
        </td>
      </tr>
    );
  }

  if (isError) {
    return (
      <tr>
        <td colSpan={columnCount}>
          <div className="empty-state">
            {error?.message ?? t("common.error")}
          </div>
        </td>
      </tr>
    );
  }

  if (customers.length === 0) {
    return (
      <tr>
        <td colSpan={columnCount}>
          <div className="empty-state">{t("common.empty")}</div>
        </td>
      </tr>
    );
  }

  const statusTexts: Record<CustomerStatus, string> = {
    active: t("customers.statusActive"),
    delinquent: t("customers.statusDelinquent"),
    inactive: t("customers.statusInactive"),
  };

  return (
    <>
      {customers.map((customer) => (
        <tr key={customer.id}>
          <td>{customer.name}</td>
          <td>{customer.cpf ?? "-"}</td>
          <td>{customer.city ?? "-"}</td>
          <td>{customer.uf ?? "-"}</td>
          <td>
            {customer.credit_limit != null
              ? customer.credit_limit.toFixed(2)
              : "-"}
          </td>
          {canViewFinancials && (
            <td
              className={`customer-balance customer-balance--${customer.current_balance == null ? "unknown" : customer.current_balance > 0 ? "debt" : customer.current_balance < 0 ? "credit" : "clear"}`}
            >
              <strong>
                {customer.current_balance == null
                  ? "—"
                  : formatCurrencyBrl(customer.current_balance)}
              </strong>
              {customer.current_balance != null && (
                <small>
                  {t(
                    customer.current_balance > 0
                      ? "customerPortfolio.openBalance"
                      : customer.current_balance < 0
                        ? "customerPortfolio.creditBalance"
                        : "customerPortfolio.settledBalance",
                  )}
                </small>
              )}
            </td>
          )}
          <td>
            <span className={`badge ${statusClasses[customer.status]}`}>
              {statusTexts[customer.status]}
            </span>
          </td>
          <td>
            <div className="table-actions">
              <button
                type="button"
                className="button"
                onClick={() => onOpenDetails(customer.id)}
              >
                {t("common.details")}
              </button>
              {canWriteCatalog && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => onEdit(customer)}
                >
                  {t("common.edit")}
                </button>
              )}
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}
