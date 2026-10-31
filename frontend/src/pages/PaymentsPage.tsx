import { SearchableSelect } from "../components/ui/SearchableSelect";
import { useListQuery, useListState } from "../hooks/useListQuery";
import { ListPagination } from "../components/ui/Pagination";
import React, { useMemo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { useNavigate } from "react-router-dom";

import type { Customer } from "../types/catalog";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { useHasPermission } from "../store/auth";
import { Modal } from "../components/ui/Modal";

export function PaymentsPage(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useListState("PaymentsPage-search", "");
  const [isModalOpen, setModalOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useListState(
    "payments-selected-customer",
    "",
  );
  const debouncedSearch = useDebouncedValue(search, 400);
  const canReadCatalog = useHasPermission("catalog:read");
  const canWriteCatalog = useHasPermission("catalog:write");

  const customersQuery = useListQuery<Customer>({
    queryKey: ["payments-customers", debouncedSearch],
    resource: "customers",
    filters: { search: debouncedSearch || undefined },
    enabled: canReadCatalog,
  });

  const customers = customersQuery.data ?? [];
  const isLoading = customersQuery.isLoading;
  const isError = customersQuery.isError;
  const error = customersQuery.error as Error | null;

  useEffect(() => {
    if (customers.length > 0) {
      setSelectedCustomerId((prev) => prev || customers[0].id);
    }
  }, [customers]);

  const rows = useMemo(() => {
    if (!canReadCatalog) {
      return (
        <tr>
          <td colSpan={4}>
            <div className="empty-state">{t("common.noPermission")}</div>
          </td>
        </tr>
      );
    }

    if (isLoading) {
      return (
        <tr>
          <td colSpan={4}>
            <div className="empty-state">{t("common.loading")}</div>
          </td>
        </tr>
      );
    }

    if (isError) {
      return (
        <tr>
          <td colSpan={4}>
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
          <td colSpan={4}>
            <div className="empty-state">{t("common.empty")}</div>
          </td>
        </tr>
      );
    }

    return customers.map((customer: Customer) => (
      <tr key={customer.id}>
        <td>{customer.legacy_code ?? "-"}</td>
        <td>{customer.name}</td>
        <td>{customer.cpf ?? "-"}</td>
        <td>
          <button
            type="button"
            className="button primary"
            disabled={!canWriteCatalog}
            onClick={() =>
              navigate(
                `/catalog/customers/${customer.id}?action=register-payment`,
              )
            }
          >
            {t("payments.register")}
          </button>
        </td>
      </tr>
    ));
  }, [
    canReadCatalog,
    canWriteCatalog,
    customers,
    error,
    isError,
    isLoading,
    navigate,
    t,
  ]);

  if (!canReadCatalog) {
    return (
      <div className="card">
        <h2>{t("payments.heading")}</h2>
        <p>{t("common.noPermission")}</p>
      </div>
    );
  }

  return (
    <div className="card payments-page">
      <div className="payments-header">
        <div>
          <h2>{t("payments.heading")}</h2>
          <p className="text-muted">{t("payments.description")}</p>
        </div>
        <button
          type="button"
          className="button primary"
          disabled={!canWriteCatalog}
          onClick={() => setModalOpen(true)}
        >
          {t("payments.newPayment")}
        </button>
      </div>

      <div className="toolbar">
        <input
          type="search"
          placeholder={`${t("common.search")}...`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>{t("customers.clientCode")}</th>
              <th>{t("customers.heading")}</th>
              <th>{t("customers.cpf")}</th>
              <th>{t("payments.register")}</th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
        <ListPagination query={customersQuery} />
      </div>

      <Modal
        open={isModalOpen}
        onClose={() => setModalOpen(false)}
        title={t("payments.newPayment")}
        width="420px"
      >
        {customers.length === 0 ? (
          <div className="empty-state">{t("common.empty")}</div>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedCustomerId) return;
              // BrowserRouter: a navegação não bloqueia esta ação da interface.
              void navigate(
                `/catalog/customers/${selectedCustomerId}?action=register-payment`,
              );
              setModalOpen(false);
            }}
            className="form-grid vertical"
          >
            <div className="form-group">
              <label id="customer-select-label" htmlFor="customer-select">
                {t("customers.heading")}
              </label>
              <SearchableSelect
                id="customer-select"
                resource="customers"
                value={selectedCustomerId}
                options={customers.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
                onChange={(option) => setSelectedCustomerId(option.value)}
              />
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setModalOpen(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={!selectedCustomerId}
              >
                {t("payments.register")}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

export default PaymentsPage;
