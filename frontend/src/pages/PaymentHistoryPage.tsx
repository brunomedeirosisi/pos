import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore, useHasPermission } from '../store/auth';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useToast } from '../components/ui/ToastProvider';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { customersService } from '../services/catalog';
import { openPaymentReceipt, paymentHistoryService, type PaymentHistoryEntry } from '../services/paymentHistory';
import { formatCurrencyBrl } from '../utils/number';
import { formatDateDdMmYyyy } from '../utils/date';
import { ApiError } from '../api';
import { SearchableSelect } from '../components/ui/SearchableSelect';

const emptyFilters = { from: '', to: '', received_by: '', customer_id: '' };

export function PaymentHistoryPage(): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const client = useQueryClient();
  const canRead = useHasPermission('catalog:read');
  const canRegister = useHasPermission('catalog:write');
  const role = useAuthStore((state) => state.user?.role);
  const canCancel = canRead && (role === 'admin' || role === 'manager');
  const [selection, setSelection] = useState({ filters: emptyFilters, page: 1 });
  const [filterReset, setFilterReset] = useState(0);
  const debounced = useDebouncedValue(selection, 300);
  const [toCancel, setToCancel] = useState<PaymentHistoryEntry | null>(null);
  const [reason, setReason] = useState('');
  const dateRangeInvalid = Boolean(
    selection.filters.from && selection.filters.to && selection.filters.from > selection.filters.to
  );
  const debouncedDateRangeInvalid = Boolean(
    debounced.filters.from && debounced.filters.to && debounced.filters.from > debounced.filters.to
  );
  const queryFilters = Object.fromEntries(Object.entries(debounced.filters).filter(([, value]) => value));
  const payments = useQuery({
    queryKey: ['payments-history', debounced],
    queryFn: () => paymentHistoryService.list({ ...queryFilters, page: debounced.page, page_size: 50 }),
    enabled: canRead && !dateRangeInvalid && !debouncedDateRangeInvalid,
  });
  const customers = useQuery({
    queryKey: ['sales-customers'],
    queryFn: () => customersService.list(),
    enabled: canRead,
  });
  const receivers = useQuery({
    queryKey: ['payment-receivers'],
    queryFn: paymentHistoryService.receivers,
    enabled: canRead,
  });
  const cancellation = useMutation({
    mutationFn: ({ payment, reason: explanation }: { payment: PaymentHistoryEntry; reason: string }) => {
      if (!canCancel) throw new Error(t('common.noPermission'));
      return paymentHistoryService.cancel(payment.id, explanation);
    },
    onSuccess: (_result, { payment }) => {
      toast.show(t('paymentHistory.cancelSuccess'), 'success');
      setToCancel(null);
      setReason('');
      for (const queryKey of [
        ['payments-history'],
        ['payment-receipt'],
        ['customer', payment.customer_id],
        ['customers'],
        ['customer-payments', payment.customer_id],
        ['payment-history-report', payment.customer_id],
      ]) {
        void client.invalidateQueries({ queryKey });
      }
    },
    onError: (error: Error) => {
      const key =
        error instanceof ApiError && error.status === 409
          ? 'alreadyCancelled'
          : error instanceof ApiError && error.status === 403
            ? 'cancellationForbidden'
            : error instanceof ApiError && error.status === 404
              ? 'notFound'
              : 'cancelError';
      toast.show(t(`paymentHistory.${key}`), 'error');
    },
  });

  const updateFilter = (key: keyof typeof emptyFilters, value: string) => {
    setSelection((current) => ({ filters: { ...current.filters, [key]: value }, page: 1 }));
  };

  if (!canRead)
    return (
      <div className="card">
        <p>{t('common.noPermission')}</p>
      </div>
    );
  const rows = payments.data?.payments ?? [];
  const pagination = payments.data?.pagination;
  return (
    <div className="card">
      <h2>{t('paymentHistory.heading')}</h2>
      <div className="toolbar">
        <div className="form-grid history-filters">
          <div className="form-group">
            <label htmlFor="payment-history-from">{t('sales.fromDate')}</label>
            <input
              id="payment-history-from"
              type="date"
              value={selection.filters.from}
              onChange={(event) => updateFilter('from', event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="payment-history-to">{t('sales.toDate')}</label>
            <input
              id="payment-history-to"
              type="date"
              value={selection.filters.to}
              onChange={(event) => updateFilter('to', event.target.value)}
            />
          </div>
          <div className="form-group">
            <label id="payment-history-receiver-label" htmlFor="payment-history-receiver">
              {t('customers.paymentReceivedBy')}
            </label>
            <SearchableSelect
              key={filterReset}
              id="payment-history-receiver"
              value={selection.filters.received_by}
              options={(receivers.data ?? []).map((receiver) => ({ value: receiver.id, label: receiver.full_name }))}
              onChange={(option) => updateFilter('received_by', option.value)}
              loading={receivers.isLoading}
              error={receivers.isError}
              onRetry={() => {
                void receivers.refetch();
              }}
            />
          </div>
          <div className="form-group">
            <label id="payment-history-customer-label" htmlFor="payment-history-customer">
              {t('customers.heading')}
            </label>
            <SearchableSelect
              key={filterReset}
              id="payment-history-customer"
              value={selection.filters.customer_id}
              options={(customers.data ?? []).map((customer) => ({ value: customer.id, label: customer.name }))}
              onChange={(option) => updateFilter('customer_id', option.value)}
              optionsKey="customers"
              loadOptions={async (search) =>
                (await customersService.list(search)).map((customer) => ({ value: customer.id, label: customer.name }))
              }
              loading={customers.isLoading}
              error={customers.isError}
              onRetry={() => {
                void customers.refetch();
              }}
            />
          </div>
        </div>
        <div className="table-actions">
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setSelection({ filters: emptyFilters, page: 1 });
              setFilterReset((reset) => reset + 1);
            }}
          >
            {t('common.reset')}
          </button>
          {canRegister && (
            <Link className="button primary" to="/payments">
              {t('payments.newPayment')}
            </Link>
          )}
        </div>
      </div>
      {dateRangeInvalid && <p role="alert">{t('paymentHistory.invalidDates')}</p>}
      {(receivers.isError || customers.isError) && <p role="alert">{t('paymentHistory.filterError')}</p>}
      <div className="table-wrapper" aria-busy={payments.isFetching}>
        <table className="table">
          <thead>
            <tr>
              <th>{t('customers.paymentDate')}</th>
              <th>{t('sales.customer')}</th>
              <th>{t('customers.paymentReceivedBy')}</th>
              <th>{t('customers.paymentAmount')}</th>
              <th>{t('customers.paymentMethod')}</th>
              <th>{t('sales.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {payments.isLoading && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">{t('common.loading')}</div>
                </td>
              </tr>
            )}
            {payments.isError && (
              <tr>
                <td colSpan={7}>
                  <div role="alert" className="empty-state">
                    {t('paymentHistory.loadError')}{' '}
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => {
                        void payments.refetch();
                      }}
                    >
                      {t('paymentHistory.retry')}
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {!payments.isLoading && !payments.isError && !dateRangeInvalid && rows.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">{t('common.empty')}</div>
                </td>
              </tr>
            )}
            {!dateRangeInvalid &&
              rows.map((payment) => (
                <tr key={payment.id}>
                  <td>{formatDateDdMmYyyy(payment.payment_date)}</td>
                  <td>{payment.customer_name}</td>
                  <td>{payment.received_by_name ?? '—'}</td>
                  <td>{formatCurrencyBrl(payment.amount)}</td>
                  <td>{t(`customers.paymentMethods.${payment.method}`)}</td>
                  <td>
                    <span className={`badge ${payment.cancelled_at ? 'status-cancelled' : 'status-completed'}`}>
                      {t(payment.cancelled_at ? 'paymentHistory.cancelled' : 'paymentHistory.received')}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <Link className="button secondary" to={`/payments/${payment.id}`}>
                        {t('paymentHistory.viewPayment')}
                      </Link>
                      <button type="button" className="button secondary" onClick={() => openPaymentReceipt(payment)}>
                        {t('sales.printReceipt')}
                      </button>
                      {canCancel && !payment.cancelled_at && (
                        <button
                          type="button"
                          className="button danger"
                          disabled={cancellation.isPending || payments.isFetching}
                          onClick={() => {
                            setToCancel(payment);
                            setReason('');
                          }}
                        >
                          {t('paymentHistory.cancelPayment')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {pagination && !dateRangeInvalid && (
        <div className="toolbar" style={{ marginTop: '1rem' }}>
          <span>
            {t('paymentHistory.page', {
              page: pagination.page,
              total: pagination.total_pages,
              count: pagination.total_items,
            })}
          </span>
          <div className="table-actions">
            <button
              type="button"
              className="button secondary"
              disabled={selection.page <= 1 || payments.isFetching}
              onClick={() => setSelection((current) => ({ ...current, page: current.page - 1 }))}
            >
              {t('paymentHistory.previous')}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={selection.page >= pagination.total_pages || payments.isFetching}
              onClick={() => setSelection((current) => ({ ...current, page: current.page + 1 }))}
            >
              {t('paymentHistory.next')}
            </button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(toCancel)}
        title={t('paymentHistory.cancelPayment')}
        description={t('paymentHistory.cancelConfirm', {
          customer: toCancel?.customer_name,
          amount: formatCurrencyBrl(toCancel?.amount ?? 0),
        })}
        confirmLabel={t('paymentHistory.cancelPayment')}
        onClose={() => {
          if (!cancellation.isPending) setToCancel(null);
        }}
        onConfirm={() => {
          if (toCancel && canCancel) cancellation.mutate({ payment: toCancel, reason });
        }}
        isPending={cancellation.isPending}
      >
        <div className="form-group">
          <label htmlFor="payment-cancellation-reason">{t('sales.reason')}</label>
          <textarea
            id="payment-cancellation-reason"
            maxLength={500}
            value={reason}
            disabled={cancellation.isPending}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
