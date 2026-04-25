import React from 'react';
import type { TFunction } from 'i18next';
import type { Customer, CustomerStatus } from '../../../types/catalog';

const statusClasses: Record<CustomerStatus, string> = {
  active: 'status-completed',
  delinquent: 'status-cancelled',
  inactive: 'status-draft',
};

type CustomersTableRowsProps = {
  customers: Customer[];
  canReadCatalog: boolean;
  canWriteCatalog: boolean;
  isLoading: boolean;
  isError: boolean;
  error?: Error;
  t: TFunction;
  onOpenDetails: (customerId: string) => void;
  onEdit: (record: Customer) => void;
};

export function CustomersTableRows(props: CustomersTableRowsProps): JSX.Element {
  const { customers, canReadCatalog, canWriteCatalog, isLoading, isError, error, t, onOpenDetails, onEdit } = props;

  if (!canReadCatalog) {
    return (
      <tr>
        <td colSpan={7}>
          <div className="empty-state">{t('common.noPermission')}</div>
        </td>
      </tr>
    );
  }

  if (isLoading) {
    return (
      <tr>
        <td colSpan={7}>
          <div className="empty-state">{t('common.loading')}</div>
        </td>
      </tr>
    );
  }

  if (isError) {
    return (
      <tr>
        <td colSpan={7}>
          <div className="empty-state">{error?.message ?? 'Error'}</div>
        </td>
      </tr>
    );
  }

  if (customers.length === 0) {
    return (
      <tr>
        <td colSpan={7}>
          <div className="empty-state">{t('common.empty')}</div>
        </td>
      </tr>
    );
  }

  const statusTexts: Record<CustomerStatus, string> = {
    active: t('customers.statusActive'),
    delinquent: t('customers.statusDelinquent'),
    inactive: t('customers.statusInactive'),
  };

  return (
    <>
      {customers.map((customer) => (
        <tr key={customer.id}>
          <td>{customer.name}</td>
          <td>{customer.cpf ?? '-'}</td>
          <td>{customer.city ?? '-'}</td>
          <td>{customer.uf ?? '-'}</td>
          <td>{customer.credit_limit != null ? customer.credit_limit.toFixed(2) : '-'}</td>
          <td>
            <span className={`badge ${statusClasses[customer.status]}`}>{statusTexts[customer.status]}</span>
          </td>
          <td>
            <div className="table-actions">
              <button type="button" className="button" onClick={() => onOpenDetails(customer.id)}>
                {t('common.details')}
              </button>
              {canWriteCatalog && (
                <button type="button" className="button secondary" onClick={() => onEdit(customer)}>
                  {t('common.edit')}
                </button>
              )}
            </div>
          </td>
        </tr>
      ))}
    </>
  );
}