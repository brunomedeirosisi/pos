import React from 'react';
import type { TFunction } from 'i18next';
import type { CustomerSale } from '../../../types/catalog';
import { formatCurrency, formatDate } from './constants';

type CustomerSalesSectionProps = {
  t: TFunction;
  language: string;
  canReadSales: boolean;
  sales: CustomerSale[];
  isLoading: boolean;
  isError: boolean;
  error?: Error;
  purchaseStatusTexts: Record<'draft' | 'completed' | 'cancelled', string>;
};

export function CustomerSalesSection(props: CustomerSalesSectionProps): JSX.Element {
  const { t, language, canReadSales, sales, isLoading, isError, error, purchaseStatusTexts } = props;

  const renderSales = () => {
    if (!canReadSales) {
      return (
        <tr>
          <td colSpan={4}>
            <div className="empty-state">{t('customers.noSalesPermission')}</div>
          </td>
        </tr>
      );
    }

    if (isLoading) {
      return (
        <tr>
          <td colSpan={4}>
            <div className="empty-state">{t('common.loading')}</div>
          </td>
        </tr>
      );
    }

    if (isError) {
      return (
        <tr>
          <td colSpan={4}>
            <div className="empty-state">{error?.message ?? 'Error'}</div>
          </td>
        </tr>
      );
    }

    if (sales.length === 0) {
      return (
        <tr>
          <td colSpan={4}>
            <div className="empty-state">{t('customers.noSales')}</div>
          </td>
        </tr>
      );
    }

    return sales.map((sale) => (
      <tr key={sale.id}>
        <td>{formatDate(sale.emission_date, language)}</td>
        <td>{sale.order_number ?? '-'}</td>
        <td>{sale.total != null ? formatCurrency(sale.total) : '-'}</td>
        <td>
          <span className="badge">{purchaseStatusTexts[sale.status]}</span>
        </td>
      </tr>
    ));
  };

  return (
    <div className="card">
      <div className="card-header">
        <h3>{t('customers.purchaseHistory')}</h3>
      </div>
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>{t('customers.purchaseDate')}</th>
              <th>{t('customers.purchaseOrder')}</th>
              <th>{t('customers.purchaseTotal')}</th>
              <th>{t('customers.purchaseStatus')}</th>
            </tr>
          </thead>
          <tbody>{renderSales()}</tbody>
        </table>
      </div>
    </div>
  );
}