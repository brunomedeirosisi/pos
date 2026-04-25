import React from 'react';
import type { TFunction } from 'i18next';
import type { CustomerDetails } from '../../../types/catalog';
import { formatCurrency, formatDate } from './constants';

type CustomerSummarySectionProps = {
  t: TFunction;
  language: string;
  customer: CustomerDetails;
  currentBalance: number;
  totalCharges: number;
  totalPayments: number;
  statusLabel: string;
  onBack: () => void;
};

export function CustomerSummarySection(props: CustomerSummarySectionProps): JSX.Element {
  const { t, language, customer, currentBalance, totalCharges, totalPayments, statusLabel, onBack } = props;

  return (
    <div className="card">
      <div className="customer-summary">
        <div>
          <button type="button" className="button secondary" onClick={onBack}>
            {t('common.back')}
          </button>
          <h2>{customer.name}</h2>
          <p className="text-muted">{statusLabel}</p>
        </div>
        <div className="balance-grid">
          <div className={`balance-card ${currentBalance > 0 ? 'balance-negative' : 'balance-clear'}`}>
            <span>{t('customers.currentBalance')}</span>
            <strong>{formatCurrency(currentBalance)}</strong>
            {currentBalance <= 0 && <small>{t('customers.paidInFull')}</small>}
          </div>
          <div className="balance-card">
            <span>{t('customers.totalCharges')}</span>
            <strong>{formatCurrency(totalCharges)}</strong>
          </div>
          <div className="balance-card">
            <span>{t('customers.totalPayments')}</span>
            <strong>{formatCurrency(totalPayments)}</strong>
            <small>
              {t('customers.lastPayment')}: {formatDate(customer.totals.last_payment_date, language)}
            </small>
          </div>
        </div>
      </div>

      <div className="customer-info-grid">
        <div>
          <h4>{t('customers.heading')}</h4>
          <ul>
            <li>{t('customers.cpf')}: <strong>{customer.cpf ?? '-'}</strong></li>
            <li>{t('customers.phone')}: <strong>{customer.phone ?? '-'}</strong></li>
            <li>{t('customers.address')}: <strong>{customer.address ?? '-'}</strong></li>
            <li>{t('customers.city')}: <strong>{customer.city ?? '-'}</strong></li>
            <li>{t('customers.uf')}: <strong>{customer.uf ?? '-'}</strong></li>
          </ul>
        </div>
        <div>
          <h4>{t('customers.creditLimit')}</h4>
          <p><strong>{customer.credit_limit != null ? formatCurrency(customer.credit_limit) : '-'}</strong></p>
          {customer.notes && (
            <>
              <h4>{t('customers.notes')}</h4>
              <p>{customer.notes}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}