import React from 'react';
import type { TFunction } from 'i18next';
import type { UseFormReturn } from 'react-hook-form';
import { Modal } from '../../../components/ui/Modal';
import type { CustomerPayment, CustomerPaymentMethod, CustomerPaymentRegisterResponse, CustomerPaymentsResponse } from '../../../types/catalog';
import { defaultPaymentFilters, formatCurrency, formatDate, paymentMethodFilterOptions, paymentMethodOptions } from './constants';

type PaymentFormValues = {
  amount: number;
  payment_date?: string;
  method: (typeof paymentMethodOptions)[number];
  reference?: string;
  notes?: string;
};

type CustomerPaymentsSectionProps = {
  t: TFunction;
  canWriteCatalog: boolean;
  currentBalance: number;
  isRegisterDisabled: boolean;
  recentPayment: CustomerPaymentRegisterResponse | null;
  setRecentPayment: React.Dispatch<React.SetStateAction<CustomerPaymentRegisterResponse | null>>;
  paymentSummary: CustomerPaymentsResponse['summary'] | undefined;
  paymentFilters: typeof defaultPaymentFilters;
  setPaymentFilters: React.Dispatch<React.SetStateAction<typeof defaultPaymentFilters>>;
  filtersChanged: boolean;
  payments: CustomerPayment[];
  paymentsQueryState: {
    isLoading: boolean;
    isError: boolean;
    isFetching: boolean;
    error?: Error;
  };
  paymentMethodLabels: Record<CustomerPaymentMethod, string>;
  onOpenPaymentModal: () => void;
  onApplyPaymentFilters: () => void;
  onResetPaymentFilters: () => void;
  onPrintHistory: () => void;
  onPrintReceipt: (paymentId: string) => void;
  isPaymentModalOpen: boolean;
  closePaymentModal: () => void;
  paymentForm: UseFormReturn<PaymentFormValues>;
  onSubmitPayment: (event?: React.BaseSyntheticEvent) => Promise<void>;
  registerPaymentPending: boolean;
};

export function CustomerPaymentsSection(props: CustomerPaymentsSectionProps): JSX.Element {
  const {
    t,
    canWriteCatalog,
    currentBalance,
    isRegisterDisabled,
    recentPayment,
    setRecentPayment,
    paymentSummary,
    paymentFilters,
    setPaymentFilters,
    filtersChanged,
    payments,
    paymentsQueryState,
    paymentMethodLabels,
    onOpenPaymentModal,
    onApplyPaymentFilters,
    onResetPaymentFilters,
    onPrintHistory,
    onPrintReceipt,
    isPaymentModalOpen,
    closePaymentModal,
    paymentForm,
    onSubmitPayment,
    registerPaymentPending,
  } = props;

  const renderPayments = () => {
    if (paymentsQueryState.isLoading) {
      return (
        <tr>
          <td colSpan={7}>
            <div className="empty-state">{t('common.loading')}</div>
          </td>
        </tr>
      );
    }

    if (paymentsQueryState.isError) {
      return (
        <tr>
          <td colSpan={7}>
            <div className="empty-state">{paymentsQueryState.error?.message ?? 'Error'}</div>
          </td>
        </tr>
      );
    }

    if (payments.length === 0) {
      return (
        <tr>
          <td colSpan={7}>
            <div className="empty-state">{t('customers.noPayments')}</div>
          </td>
        </tr>
      );
    }

    return payments.map((payment) => (
      <tr key={payment.id}>
        <td>{formatDate(payment.payment_date)}</td>
        <td>{formatCurrency(payment.amount)}</td>
        <td>
          {payment.received_by_name ?? '-'}
          {payment.source === 'legacy' && <span className="badge status-draft legacy-badge">{t('customers.paymentMethods.legacy')}</span>}
        </td>
        <td>{paymentMethodLabels[payment.method]}</td>
        <td>{payment.reference ?? '-'}</td>
        <td>{payment.notes ?? '-'}</td>
        <td>
          <button type="button" className="button secondary" onClick={() => onPrintReceipt(payment.id)}>
            {t('customers.printReceipt')}
          </button>
        </td>
      </tr>
    ));
  };

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h3>{t('customers.paymentHistory')}</h3>
          {canWriteCatalog && (
            <button type="button" className="button primary" onClick={onOpenPaymentModal} disabled={isRegisterDisabled}>
              {t('customers.registerPayment')}
            </button>
          )}
        </div>

        {recentPayment && (
          <div className="info-banner success payment-receipt-banner">
            <div>
              <strong>{t('customers.paymentSavedQuick', { id: recentPayment.payment.id.slice(0, 8).toUpperCase() })}</strong>
              <div>{t('customers.paymentNewBalance', { balance: formatCurrency(recentPayment.summary.new_balance) })}</div>
            </div>
            <div className="banner-actions">
              <button type="button" className="button secondary" onClick={() => onPrintReceipt(recentPayment.payment.id)}>
                {t('customers.printReceipt')}
              </button>
              <button type="button" className="button ghost" onClick={() => setRecentPayment(null)}>
                {t('common.close')}
              </button>
            </div>
          </div>
        )}

        {paymentSummary && (
          <div className="balance-grid compact">
            <div className="balance-card">
              <span>{t('customers.totalCharges')}</span>
              <strong>{formatCurrency(paymentSummary.total_debt)}</strong>
            </div>
            <div className="balance-card">
              <span>{t('customers.totalPayments')}</span>
              <strong>{formatCurrency(paymentSummary.total_paid)}</strong>
            </div>
            <div className="balance-card">
              <span>{t('customers.currentBalance')}</span>
              <strong>{formatCurrency(currentBalance)}</strong>
            </div>
            <div className="balance-card">
              <span>{t('customers.filteredPayments')}</span>
              <strong>{formatCurrency(paymentSummary.filtered_total_paid)}</strong>
              <small>{t('customers.filteredCount', { count: paymentSummary.filtered_count })}</small>
            </div>
          </div>
        )}

        <div className="payment-filters">
          <div className="form-group">
            <label htmlFor="filter-start">{t('customers.filterFrom')}</label>
            <input
              id="filter-start"
              type="date"
              value={paymentFilters.start_date}
              onChange={(event) => setPaymentFilters((prev) => ({ ...prev, start_date: event.target.value }))}
            />
          </div>
          <div className="form-group">
            <label htmlFor="filter-end">{t('customers.filterTo')}</label>
            <input
              id="filter-end"
              type="date"
              value={paymentFilters.end_date}
              onChange={(event) => setPaymentFilters((prev) => ({ ...prev, end_date: event.target.value }))}
            />
          </div>
          <div className="form-group">
            <label htmlFor="filter-method">{t('customers.paymentMethod')}</label>
            <select
              id="filter-method"
              value={paymentFilters.method}
              onChange={(event) =>
                setPaymentFilters((prev) => ({ ...prev, method: event.target.value as (typeof paymentMethodFilterOptions)[number] }))
              }
            >
              {paymentMethodFilterOptions.map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? t('customers.paymentMethodAll') : paymentMethodLabels[option as CustomerPaymentMethod]}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="filter-sort">{t('customers.paymentSort')}</label>
            <select
              id="filter-sort"
              value={paymentFilters.sort}
              onChange={(event) => setPaymentFilters((prev) => ({ ...prev, sort: event.target.value as 'asc' | 'desc' }))}
            >
              <option value="desc">{t('customers.paymentSortNewest')}</option>
              <option value="asc">{t('customers.paymentSortOldest')}</option>
            </select>
          </div>
          <div className="form-actions inline-actions">
            <button type="button" className="button secondary" onClick={onResetPaymentFilters}>
              {t('common.reset')}
            </button>
            <button type="button" className="button primary" onClick={onApplyPaymentFilters} disabled={!filtersChanged}>
              {paymentsQueryState.isFetching ? t('common.loading') : t('common.apply')}
            </button>
            <button type="button" className="button ghost" onClick={onPrintHistory}>
              {t('customers.printPaymentHistory')}
            </button>
          </div>
        </div>

        {currentBalance <= 0 && <div className="info-banner success">{t('customers.paidInFull')}</div>}

        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>{t('customers.paymentDate')}</th>
                <th>{t('customers.paymentAmount')}</th>
                <th>{t('customers.paymentReceivedBy')}</th>
                <th>{t('customers.paymentMethod')}</th>
                <th>{t('customers.paymentReference')}</th>
                <th>{t('customers.paymentNotes')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>{renderPayments()}</tbody>
          </table>
        </div>
      </div>

      <Modal open={isPaymentModalOpen} onClose={closePaymentModal} title={t('customers.registerPayment')} width="520px">
        <form onSubmit={onSubmitPayment} className="form-grid vertical">
          <div className="form-group">
            <label htmlFor="payment-amount">{t('customers.paymentAmount')}*</label>
            <input id="payment-amount" type="number" step="0.01" {...paymentForm.register('amount')} />
            {paymentForm.formState.errors.amount && (
              <small style={{ color: '#dc2626' }}>{paymentForm.formState.errors.amount.message}</small>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="payment-date">{t('customers.paymentDate')}</label>
            <input id="payment-date" type="date" {...paymentForm.register('payment_date')} />
          </div>
          <div className="form-group">
            <label htmlFor="payment-method">{t('customers.paymentMethod')}</label>
            <select id="payment-method" {...paymentForm.register('method')}>
              {paymentMethodOptions.map((method) => (
                <option key={method} value={method}>
                  {paymentMethodLabels[method]}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="payment-reference">{t('customers.paymentReference')}</label>
            <input id="payment-reference" {...paymentForm.register('reference')} />
          </div>
          <div className="form-group">
            <label htmlFor="payment-notes">{t('customers.paymentNotes')}</label>
            <textarea id="payment-notes" rows={3} {...paymentForm.register('notes')} />
          </div>
          <div className="form-actions">
            <button type="button" className="button secondary" onClick={closePaymentModal} disabled={registerPaymentPending}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="button primary" disabled={registerPaymentPending}>
              {registerPaymentPending ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
