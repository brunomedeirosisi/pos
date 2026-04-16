import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { customersService } from '../../services/catalog';
import type {
  CustomerDetails,
  CustomerPayment,
  CustomerPaymentMethod,
  CustomerPaymentRegisterResponse,
  CustomerPaymentsResponse,
  CustomerSale,
} from '../../types/catalog';
import { useToast } from '../../components/ui/ToastProvider';
import { Modal } from '../../components/ui/Modal';
import { useHasPermission } from '../../store/auth';
import { parseLocaleNumericInput } from '../../utils/number';

const paymentMethodOptions = ['cash', 'card', 'bank', 'other'] as const;
const paymentMethodFilterOptions = ['all', 'cash', 'card', 'bank', 'other', 'legacy'] as const;
const defaultPaymentFilters = {
  start_date: '',
  end_date: '',
  method: 'all' as (typeof paymentMethodFilterOptions)[number],
  sort: 'desc' as 'asc' | 'desc',
};

const paymentFormSchema = z.object({
  amount: z.preprocess(parseLocaleNumericInput, z.number().positive()),
  payment_date: z
    .string()
    .trim()
    .optional(),
  method: z.enum(paymentMethodOptions),
  reference: z
    .string()
    .trim()
    .max(120)
    .optional(),
  notes: z
    .string()
    .trim()
    .max(500)
    .optional(),
});

type PaymentFormValues = z.infer<typeof paymentFormSchema>;

const currencyFormatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'BRL' });

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-';
  return currencyFormatter.format(value);
}

function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString(locale);
}

export function CustomerDetailsPage(): JSX.Element {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canReadCatalog = useHasPermission('catalog:read');
  const canWriteCatalog = useHasPermission('catalog:write');
  const canReadSales = useHasPermission('sales:read');
  const [isPaymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentFilters, setPaymentFilters] = useState(defaultPaymentFilters);
  const [appliedPaymentFilters, setAppliedPaymentFilters] = useState(defaultPaymentFilters);
  const [recentPayment, setRecentPayment] = useState<CustomerPaymentRegisterResponse | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const normalizedPaymentFilters = useMemo(
    () => ({
      start_date: appliedPaymentFilters.start_date || undefined,
      end_date: appliedPaymentFilters.end_date || undefined,
      method:
        appliedPaymentFilters.method === 'all'
          ? undefined
          : (appliedPaymentFilters.method as CustomerPaymentMethod),
      sort: appliedPaymentFilters.sort,
    }),
    [appliedPaymentFilters]
  );
  const filtersChanged = useMemo(
    () => JSON.stringify(paymentFilters) !== JSON.stringify(appliedPaymentFilters),
    [appliedPaymentFilters, paymentFilters]
  );

  const paymentForm = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      amount: 0,
      payment_date: today,
      method: 'cash',
      reference: '',
      notes: '',
    },
  });

  const customerQuery = useQuery<CustomerDetails>({
    queryKey: ['customer', id],
    queryFn: () => customersService.get(id!),
    enabled: Boolean(id) && canReadCatalog,
  });

  const paymentsQuery = useQuery<CustomerPaymentsResponse>({
    queryKey: ['customer-payments', id, normalizedPaymentFilters],
    queryFn: () => customersService.listPayments(id!, normalizedPaymentFilters),
    enabled: Boolean(id) && canReadCatalog,
  });

  const salesQuery = useQuery<CustomerSale[]>({
    queryKey: ['customer-sales', id],
    queryFn: () => customersService.listSales(id!),
    enabled: Boolean(id) && canReadSales,
  });

  const registerPayment = useMutation({
    mutationFn: (values: PaymentFormValues): Promise<CustomerPaymentRegisterResponse> => {
      if (!id) throw new Error('Missing customer id');
      return customersService.registerPayment(id, {
        amount: values.amount,
        payment_date: values.payment_date || undefined,
        method: values.method,
        reference: values.reference?.trim() ? values.reference.trim() : undefined,
        notes: values.notes?.trim() ? values.notes.trim() : undefined,
      });
    },
    onSuccess: (data) => {
      toast.show(
        t('customers.paymentSavedWithBalance', {
          id: data.payment.id.slice(0, 8).toUpperCase(),
          balance: formatCurrency(data.summary.new_balance),
        }),
        'success'
      );
      setRecentPayment(data);
      if (id) {
        queryClient.invalidateQueries({ queryKey: ['customer', id] });
        queryClient.invalidateQueries({ queryKey: ['customer-payments', id], exact: false });
      }
      setPaymentModalOpen(false);
    },
    onError: (error: Error) => {
      toast.show(error.message, 'error');
    },
  });

  if (!canReadCatalog) {
    return (
      <div className="card">
        <button type="button" className="button secondary" onClick={() => navigate('/catalog/customers')}>
          {t('common.back')}
        </button>
        <p>{t('common.noPermission')}</p>
      </div>
    );
  }

  const customer = customerQuery.data;
  const payments = paymentsQuery.data?.payments ?? [];
  const paymentSummary = paymentsQuery.data?.summary;
  const sales = salesQuery.data ?? [];
  const totalCharges = paymentSummary?.total_debt ?? customer?.totals.total_charges ?? 0;
  const totalPayments = paymentSummary?.total_paid ?? customer?.totals.total_payments ?? 0;
  const baseBalance = customer?.totals.current_balance ?? 0;
  const currentBalance = paymentSummary?.current_balance ?? baseBalance;
  const isRegisterDisabled = !canWriteCatalog || !customer || currentBalance <= 0 || registerPayment.isPending;
  const actionParam = searchParams.get('action');

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

  const statusLabels = useMemo(
    () => ({
      active: t('customers.statusActive'),
      delinquent: t('customers.statusDelinquent'),
      inactive: t('customers.statusInactive'),
    }),
    [t]
  );

  const purchaseStatusTexts = useMemo(
    () => ({
      draft: t('customers.purchaseStatusDraft'),
      completed: t('customers.purchaseStatusCompleted'),
      cancelled: t('customers.purchaseStatusCancelled'),
    }),
    [t]
  );

  const handleOpenPaymentModal = useCallback((): boolean => {
    if (!customer) return false;
    if (!canWriteCatalog) {
      toast.show(t('common.noPermission'), 'error');
      return false;
    }
    if (currentBalance <= 0) {
      toast.show(t('customers.paidInFull'));
      return false;
    }
    paymentForm.reset({
      amount: Number(currentBalance.toFixed(2)),
      payment_date: today,
      method: 'cash',
      reference: '',
      notes: '',
    });
    setPaymentModalOpen(true);
    return true;
  }, [canWriteCatalog, currentBalance, customer, paymentForm, t, today, toast]);

  function closePaymentModal() {
    if (registerPayment.isPending) return;
    setPaymentModalOpen(false);
  }

  const handleApplyPaymentFilters = () => {
    setAppliedPaymentFilters(paymentFilters);
  };

  const handleResetPaymentFilters = () => {
    setPaymentFilters(defaultPaymentFilters);
    setAppliedPaymentFilters(defaultPaymentFilters);
  };

  const handlePrintReceipt = (paymentId: string) => {
    if (!id) return;
    navigate(`/catalog/customers/${id}/payments/${paymentId}/receipt`);
  };

  const handlePrintHistory = () => {
    if (!id) return;
    const params = new URLSearchParams();
    if (normalizedPaymentFilters.start_date) params.set('start_date', normalizedPaymentFilters.start_date);
    if (normalizedPaymentFilters.end_date) params.set('end_date', normalizedPaymentFilters.end_date);
    if (normalizedPaymentFilters.method) params.set('method', normalizedPaymentFilters.method);
    params.set('sort', normalizedPaymentFilters.sort);
    const queryString = params.toString();
    navigate(`/catalog/customers/${id}/payments/history${queryString ? `?${queryString}` : ''}`);
  };

  const onSubmitPayment = paymentForm.handleSubmit((values) => {
    registerPayment.mutate(values);
  });

  useEffect(() => {
    setRecentPayment(null);
    setPaymentFilters(defaultPaymentFilters);
    setAppliedPaymentFilters(defaultPaymentFilters);
  }, [id]);

  useEffect(() => {
    if (actionParam !== 'register-payment' || !customer) {
      return;
    }
    handleOpenPaymentModal();
    const next = new URLSearchParams(searchParams);
    next.delete('action');
    setSearchParams(next, { replace: true });
  }, [actionParam, customer, handleOpenPaymentModal, searchParams, setSearchParams]);

  const renderPayments = () => {
    if (paymentsQuery.isLoading) {
      return (
        <tr>
          <td colSpan={7}>
            <div className="empty-state">{t('common.loading')}</div>
          </td>
        </tr>
      );
    }
    if (paymentsQuery.isError) {
      const error = paymentsQuery.error as Error | undefined;
      return (
        <tr>
          <td colSpan={7}>
            <div className="empty-state">{error?.message ?? 'Error'}</div>
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
    return payments.map((payment: CustomerPayment) => (
      <tr key={payment.id}>
        <td>{formatDate(payment.payment_date, i18n.language)}</td>
        <td>{formatCurrency(payment.amount)}</td>
        <td>
          {payment.received_by_name ?? '-'}
          {payment.source === 'legacy' && (
            <span className="badge status-draft legacy-badge">{t('customers.paymentMethods.legacy')}</span>
          )}
        </td>
        <td>{paymentMethodLabels[payment.method]}</td>
        <td>{payment.reference ?? '-'}</td>
        <td>{payment.notes ?? '-'}</td>
        <td>
          <button type="button" className="button secondary" onClick={() => handlePrintReceipt(payment.id)}>
            {t('customers.printReceipt')}
          </button>
        </td>
      </tr>
    ));
  };

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
    if (salesQuery.isLoading) {
      return (
        <tr>
          <td colSpan={4}>
            <div className="empty-state">{t('common.loading')}</div>
          </td>
        </tr>
      );
    }
    if (salesQuery.isError) {
      const error = salesQuery.error as Error | undefined;
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
        <td>{formatDate(sale.emission_date, i18n.language)}</td>
        <td>{sale.order_number ?? '-'}</td>
        <td>{sale.total != null ? formatCurrency(sale.total) : '-'}</td>
        <td>
          <span className="badge">{purchaseStatusTexts[sale.status]}</span>
        </td>
      </tr>
    ));
  };

  const renderCustomerBody = () => {
    if (customerQuery.isLoading) {
      return <div className="empty-state">{t('common.loading')}</div>;
    }
    if (customerQuery.isError || !customer) {
      const error = customerQuery.error as Error | undefined;
      return <div className="empty-state">{error?.message ?? 'Error'}</div>;
    }

    return (
      <>
        <div className="card">
          <div className="customer-summary">
            <div>
              <button type="button" className="button secondary" onClick={() => navigate('/catalog/customers')}>
                {t('common.back')}
              </button>
              <h2>{customer.name}</h2>
              <p className="text-muted">{statusLabels[customer.status as keyof typeof statusLabels]}</p>
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
                  {t('customers.lastPayment')}: {formatDate(customer.totals.last_payment_date, i18n.language)}
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

        <div className="card">
          <div className="card-header">
            <h3>{t('customers.paymentHistory')}</h3>
            {canWriteCatalog && (
              <button type="button" className="button primary" onClick={handleOpenPaymentModal} disabled={isRegisterDisabled}>
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
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => handlePrintReceipt(recentPayment.payment.id)}
                >
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
                onChange={(event) =>
                  setPaymentFilters((prev) => ({ ...prev, sort: event.target.value as 'asc' | 'desc' }))
                }
              >
                <option value="desc">{t('customers.paymentSortNewest')}</option>
                <option value="asc">{t('customers.paymentSortOldest')}</option>
              </select>
            </div>
            <div className="form-actions inline-actions">
              <button type="button" className="button secondary" onClick={handleResetPaymentFilters}>
                {t('common.reset')}
              </button>
              <button
                type="button"
                className="button primary"
                onClick={handleApplyPaymentFilters}
                disabled={!filtersChanged}
              >
                {paymentsQuery.isFetching ? t('common.loading') : t('common.apply')}
              </button>
              <button type="button" className="button ghost" onClick={handlePrintHistory}>
                {t('customers.printPaymentHistory')}
              </button>
            </div>
          </div>
          {currentBalance <= 0 && (
            <div className="info-banner success">
              {t('customers.paidInFull')}
            </div>
          )}
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
      </>
    );
  };

  return (
    <div className="customer-details-page">
      {renderCustomerBody()}
      <Modal
        open={isPaymentModalOpen}
        onClose={closePaymentModal}
        title={t('customers.registerPayment')}
        width="520px"
      >
        <form onSubmit={onSubmitPayment} className="form-grid vertical">
          <div className="form-group">
            <label htmlFor="payment-amount">{t('customers.paymentAmount')}*</label>
            <input
              id="payment-amount"
              type="number"
              step="0.01"
              {...paymentForm.register('amount')}
            />
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
            <button type="button" className="button secondary" onClick={closePaymentModal} disabled={registerPayment.isPending}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="button primary" disabled={registerPayment.isPending}>
              {registerPayment.isPending ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
