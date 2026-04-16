import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { customersService } from '../../services/catalog';
import type { CustomerPaymentHistoryReport, CustomerPaymentMethod } from '../../types/catalog';

const currencyFormatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'BRL' });

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-';
  return currencyFormatter.format(value);
}

function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(locale);
}

function formatDateTime(value: string | null | undefined, locale: string): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(locale);
}

export function CustomerPaymentHistoryReportPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const filters = useMemo(
    () => ({
      start_date: searchParams.get('start_date') || undefined,
      end_date: searchParams.get('end_date') || undefined,
      method: (searchParams.get('method') as CustomerPaymentMethod | null) || undefined,
      sort: (searchParams.get('sort') as 'asc' | 'desc' | null) || 'desc',
    }),
    [searchParams]
  );

  const paymentMethodLabels = useMemo(
    () => ({
      cash: t('customers.paymentMethods.cash'),
      card: t('customers.paymentMethods.card'),
      bank: t('customers.paymentMethods.bank'),
      other: t('customers.paymentMethods.other'),
      legacy: t('customers.paymentMethods.legacy'),
    }),
    [t]
  );

  const reportQuery = useQuery<CustomerPaymentHistoryReport>({
    queryKey: ['payment-history-report', id, filters],
    queryFn: () => customersService.getPaymentHistoryReport(id!, filters),
    enabled: Boolean(id),
  });

  if (reportQuery.isLoading) {
    return <div className="printable-page">{t('common.loading')}</div>;
  }

  if (reportQuery.isError || !reportQuery.data) {
    const error = reportQuery.error as Error | undefined;
    return (
      <div className="printable-page">
        <div className="printable-card">
          <p className="empty-state">{error?.message ?? t('customers.paymentHistoryError')}</p>
          <button type="button" className="button secondary" onClick={() => navigate(-1)}>
            {t('common.back')}
          </button>
        </div>
      </div>
    );
  }

  const { company, customer, payments, summary, generated_at } = reportQuery.data;

  return (
    <div className="printable-page">
      <div className="printable-actions">
        <button type="button" className="button secondary" onClick={() => navigate(-1)}>
          {t('common.back')}
        </button>
        <button type="button" className="button primary" onClick={() => window.print()}>
          {t('common.print')}
        </button>
      </div>
      <div className="printable-card">
        <div className="printable-header">
          <div>
            <h2>{company.name}</h2>
            <p>{company.address}</p>
            <p>{t('customers.companyTaxId', { taxId: company.tax_id })}</p>
          </div>
          <div className="text-right">
            <div className="receipt-code">{t('customers.paymentHistoryReportTitle')}</div>
            <div>{t('customers.generatedAt')}: {formatDateTime(generated_at, i18n.language)}</div>
          </div>
        </div>

        <div className="printable-section">
          <h4>{t('customers.heading')}</h4>
          <p><strong>{customer.name}</strong></p>
          <p>{customer.legacy_code ? `${t('customers.clientCode')}: ${customer.legacy_code}` : ''}</p>
          <p>{customer.cpf ?? t('common.none')}</p>
          <p>{customer.address ?? '-'}</p>
          <p>{[customer.city, customer.uf].filter(Boolean).join(' / ') || '-'}</p>
          <p>{customer.phone ?? '-'}</p>
        </div>

        <div className="receipt-grid">
          <div>
            <span>{t('customers.totalCharges')}</span>
            <strong>{formatCurrency(summary.total_debt)}</strong>
          </div>
          <div>
            <span>{t('customers.totalPayments')}</span>
            <strong>{formatCurrency(summary.total_paid)}</strong>
          </div>
          <div>
            <span>{t('customers.currentBalance')}</span>
            <strong>{formatCurrency(summary.current_balance)}</strong>
          </div>
          <div>
            <span>{t('customers.filteredPayments')}</span>
            <strong>{formatCurrency(summary.filtered_total_paid)}</strong>
            <small>{t('customers.filteredCount', { count: summary.filtered_count })}</small>
          </div>
        </div>

        <div className="printable-section">
          <p className="text-muted">
            {t('customers.appliedFilters', {
              start: summary.applied_filters.start_date ?? t('customers.notInformed'),
              end: summary.applied_filters.end_date ?? t('customers.notInformed'),
              method: summary.applied_filters.method
                ? paymentMethodLabels[summary.applied_filters.method]
                : t('customers.paymentMethodAll'),
            })}
          </p>
        </div>

        <div className="table-wrapper">
          <table className="table printable-table">
            <thead>
              <tr>
                <th>{t('customers.paymentDate')}</th>
                <th>{t('customers.paymentAmount')}</th>
                <th>{t('customers.paymentMethod')}</th>
                <th>{t('customers.paymentReceivedBy')}</th>
                <th>{t('customers.paymentReference')}</th>
                <th>{t('customers.paymentNotes')}</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">{t('customers.noPayments')}</div>
                  </td>
                </tr>
              ) : (
                payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{formatDate(payment.payment_date, i18n.language)}</td>
                    <td>{formatCurrency(payment.amount)}</td>
                    <td>{paymentMethodLabels[payment.method]}</td>
                    <td>{payment.received_by_name ?? '-'}</td>
                    <td>{payment.reference ?? '-'}</td>
                    <td>{payment.notes ?? '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default CustomerPaymentHistoryReportPage;
