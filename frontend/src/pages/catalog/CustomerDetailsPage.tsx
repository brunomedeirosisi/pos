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
  CustomerPaymentMethod,
  CustomerPaymentRegisterResponse,
  CustomerPaymentsResponse,
  CustomerSale,
} from '../../types/catalog';
import { useToast } from '../../components/ui/ToastProvider';
import { useHasPermission } from '../../store/auth';
import { parseLocaleNumericInput } from '../../utils/number';
import { getTodayIsoDate } from '../../utils/date';
import { CustomerPaymentsSection } from './customer-details/CustomerPaymentsSection';
import { CustomerSalesSection } from './customer-details/CustomerSalesSection';
import { CustomerSummarySection } from './customer-details/CustomerSummarySection';
import { defaultPaymentFilters, formatCurrency, paymentMethodOptions } from './customer-details/constants';

const paymentFormSchema = z.object({
  amount: z.preprocess(parseLocaleNumericInput, z.number().positive()),
  payment_date: z.string().trim().optional(),
  method: z.enum(paymentMethodOptions),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

type PaymentFormValues = z.infer<typeof paymentFormSchema>;

export function CustomerDetailsPage(): JSX.Element {
  const { t } = useTranslation();
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

  const today = getTodayIsoDate();

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

  const customer = customerQuery.data;
  const payments = paymentsQuery.data?.payments ?? [];
  const paymentSummary = paymentsQuery.data?.summary;
  const sales = salesQuery.data ?? [];

  const totalCharges = paymentSummary?.total_debt ?? customer?.totals.total_charges ?? 0;
  const totalPayments = paymentSummary?.total_paid ?? customer?.totals.total_payments ?? 0;
  const currentBalance = paymentSummary?.current_balance ?? customer?.totals.current_balance ?? 0;

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

  const closePaymentModal = () => {
    if (registerPayment.isPending) return;
    setPaymentModalOpen(false);
  };

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

  if (customerQuery.isLoading) {
    return <div className="empty-state">{t('common.loading')}</div>;
  }

  if (customerQuery.isError || !customer) {
    const error = customerQuery.error as Error | undefined;
    return <div className="empty-state">{error?.message ?? 'Error'}</div>;
  }

  return (
    <div className="customer-details-page">
      <CustomerSummarySection
        t={t}
        customer={customer}
        currentBalance={currentBalance}
        totalCharges={totalCharges}
        totalPayments={totalPayments}
        statusLabel={statusLabels[customer.status as keyof typeof statusLabels]}
        onBack={() => navigate('/catalog/customers')}
      />

      <CustomerSalesSection
        t={t}
        canReadSales={canReadSales}
        sales={sales}
        salesState={{
          isLoading: salesQuery.isLoading,
          isError: salesQuery.isError,
          error: (salesQuery.error as Error | undefined) ?? undefined,
        }}
        payments={payments}
        paymentsState={{
          isLoading: paymentsQuery.isLoading,
          isError: paymentsQuery.isError,
          error: (paymentsQuery.error as Error | undefined) ?? undefined,
        }}
        paymentMethodLabels={paymentMethodLabels}
        purchaseStatusTexts={purchaseStatusTexts}
      />

      <CustomerPaymentsSection
        t={t}
        canWriteCatalog={canWriteCatalog}
        currentBalance={currentBalance}
        isRegisterDisabled={isRegisterDisabled}
        recentPayment={recentPayment}
        setRecentPayment={setRecentPayment}
        paymentSummary={paymentSummary}
        paymentFilters={paymentFilters}
        setPaymentFilters={setPaymentFilters}
        filtersChanged={filtersChanged}
        payments={payments}
        paymentsQueryState={{
          isLoading: paymentsQuery.isLoading,
          isError: paymentsQuery.isError,
          isFetching: paymentsQuery.isFetching,
          error: (paymentsQuery.error as Error | undefined) ?? undefined,
        }}
        paymentMethodLabels={paymentMethodLabels}
        onOpenPaymentModal={handleOpenPaymentModal}
        onApplyPaymentFilters={handleApplyPaymentFilters}
        onResetPaymentFilters={handleResetPaymentFilters}
        onPrintHistory={handlePrintHistory}
        onPrintReceipt={handlePrintReceipt}
        isPaymentModalOpen={isPaymentModalOpen}
        closePaymentModal={closePaymentModal}
        paymentForm={paymentForm}
        onSubmitPayment={onSubmitPayment}
        registerPaymentPending={registerPayment.isPending}
      />
    </div>
  );
}
