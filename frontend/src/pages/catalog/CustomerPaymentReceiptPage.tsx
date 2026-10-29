import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { customersService } from '../../services/catalog';
import { paymentHistoryService } from '../../services/paymentHistory';
import type { CustomerPaymentReceipt } from '../../types/catalog';
import { formatDateDdMmYyyy, formatDateTimeDdMmYyyy } from '../../utils/date';

const currencyFormatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'BRL' });

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-';
  return currencyFormatter.format(value);
}

export function CustomerPaymentReceiptPage(): JSX.Element {
  const { t } = useTranslation();
  const { customerId, paymentId } = useParams<{ customerId: string; paymentId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const autoPrint = Boolean(customerId) || searchParams.get('autoprint') === '1';
  const paymentMethodLabels = React.useMemo(
    () => ({
      cash: t('customers.paymentMethods.cash'),
      card: t('customers.paymentMethods.card'),
      bank: t('customers.paymentMethods.bank'),
      other: t('customers.paymentMethods.other'),
      legacy: t('customers.paymentMethods.legacy'),
    }),
    [t]
  );

  const receiptQuery = useQuery<CustomerPaymentReceipt>({
    queryKey: ['payment-receipt', customerId, paymentId],
    queryFn: () =>
      customerId ? customersService.getPaymentReceipt(customerId, paymentId!) : paymentHistoryService.get(paymentId!),
    enabled: Boolean(paymentId),
  });

  useEffect(() => {
    if (autoPrint && receiptQuery.status === 'success') {
      const timer = setTimeout(() => window.print(), 200);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [autoPrint, receiptQuery.status]);

  if (receiptQuery.isLoading) {
    return <div className="printable-page">{t('common.loading')}</div>;
  }

  if (receiptQuery.isError || !receiptQuery.data) {
    const error = receiptQuery.error as Error | undefined;
    return (
      <div className="printable-page">
        <div className="printable-card">
          <p className="empty-state">{error?.message ?? t('customers.paymentReceiptError')}</p>
          <button type="button" className="button secondary" onClick={() => navigate(-1)}>
            {t('common.back')}
          </button>
        </div>
      </div>
    );
  }

  const { company, customer, payment, balances, generated_at } = receiptQuery.data;

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
        {payment.cancelled_at && (
          <div role="alert" className="payment-cancelled-notice">
            <h3>{t('paymentHistory.cancelledNotice')}</h3>
            <p>{t('paymentHistory.cancelledExplanation')}</p>
            <p>
              {formatDateTimeDdMmYyyy(payment.cancelled_at)} — {payment.cancelled_by_name ?? '—'}
            </p>
            {payment.cancellation_reason && (
              <p>
                {t('sales.reason')}: {payment.cancellation_reason}
              </p>
            )}
          </div>
        )}
        <div className="printable-header">
          <div>
            <h2>{company.name}</h2>
            <p>{company.address}</p>
            <p>{t('customers.companyTaxId', { taxId: company.tax_id })}</p>
          </div>
          <div className="text-right">
            <div className="receipt-code">{payment.code}</div>
            <div>
              {t('customers.paymentDate')}: {formatDateDdMmYyyy(payment.payment_date)}
            </div>
            <div>
              {t('customers.paymentDateTime')}: {formatDateTimeDdMmYyyy(payment.created_at)}
            </div>
            <div>
              {t('customers.generatedAt')}: {formatDateTimeDdMmYyyy(generated_at)}
            </div>
          </div>
        </div>

        <div className="printable-section">
          <h4>{t('customers.heading')}</h4>
          <p>
            <strong>{customer.name}</strong>
          </p>
          <p>{customer.legacy_code ? `${t('customers.clientCode')}: ${customer.legacy_code}` : ''}</p>
          <p>{customer.cpf ?? t('common.none')}</p>
          <p>{customer.address ?? '-'}</p>
          <p>{[customer.city, customer.uf].filter(Boolean).join(' / ') || '-'}</p>
          <p>{customer.phone ?? '-'}</p>
        </div>

        <div className="receipt-grid">
          <div>
            <strong>{t('customers.paymentAmount')}</strong>
            <div>{formatCurrency(payment.amount)}</div>
          </div>
          <div>
            <strong>{t('customers.paymentMethod')}</strong>
            <div>{paymentMethodLabels[payment.method]}</div>
          </div>
          <div>
            <strong>{t('customers.paymentReceivedBy')}</strong>
            <div>{payment.received_by_name ?? '-'}</div>
          </div>
          <div>
            <strong>{t('customers.paymentReference')}</strong>
            <div>{payment.reference ?? '-'}</div>
          </div>
        </div>

        {payment.notes && (
          <p>
            {t('customers.paymentNotes')}: {payment.notes}
          </p>
        )}
        {balances.legacy_balance && (
          <div className="printable-section">
            <p>
              {t('customers.legacySourceBalance')}: {formatCurrency(balances.legacy_balance.source_balance)}
            </p>
            <p>
              {t('customers.legacyBalanceAdjustment')}: {formatCurrency(balances.legacy_balance.adjustment)}
            </p>
            <p className="text-muted">{t('customers.legacyBalanceHint')}</p>
          </div>
        )}
        {balances.historical_balance_unavailable && (
          <p role="status">{t('customers.legacyHistoricalBalanceUnavailable')}</p>
        )}
        <div className="receipt-grid" style={{ marginTop: '12px' }}>
          <div>
            <span>{t('customers.previousBalance')}</span>
            <div>
              <strong>{formatCurrency(balances.previous_balance)}</strong>
            </div>
          </div>
          <div>
            <span>{t('customers.paymentAmount')}</span>
            <div>
              <strong>{formatCurrency(balances.payment_amount)}</strong>
            </div>
          </div>
          <div>
            <span>{t('customers.paymentNewBalanceLabel')}</span>
            <div>
              <strong>{formatCurrency(balances.new_balance)}</strong>
            </div>
          </div>
        </div>

        <div className="printable-section" style={{ marginTop: '16px' }}>
          <p className="text-muted">{t('customers.paymentThanks')}</p>
        </div>
      </div>
    </div>
  );
}

export default CustomerPaymentReceiptPage;
