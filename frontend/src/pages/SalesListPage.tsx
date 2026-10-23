import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { salesService } from '../services/sales';
import { customersService, sellersService, paymentTermsService } from '../services/catalog';
import type { Sale, SaleStatus } from '../types/sales';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useToast } from '../components/ui/ToastProvider';
import { useHasPermission } from '../store/auth';
import { formatDateTimeDdMmYyyy } from '../utils/date';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useSaleReceiptActions } from '../hooks/useSaleReceiptActions';
import { formatCurrencyBrl } from '../utils/number';

const statusClasses: Record<SaleStatus, string> = {
  completed: 'status-completed',
  cancelled: 'status-cancelled',
  draft: 'status-draft',
};

type FiltersState = {
  from: string;
  to: string;
  seller_id: string;
  customer_id: string;
  payment_term_id: string;
};

const defaultFilters: FiltersState = {
  from: '',
  to: '',
  seller_id: '',
  customer_id: '',
  payment_term_id: '',
};

export function SalesListPage(): JSX.Element {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canReadSales = useHasPermission('sales:read');
  const canCancelSales = useHasPermission('sales:cancel');
  const canCheckout = useHasPermission('pos:checkout');
  const { isPrinting, printReceipt } = useSaleReceiptActions();

  const [filters, setFilters] = useState<FiltersState>(defaultFilters);
  const [saleToCancel, setSaleToCancel] = useState<Sale | null>(null);
  const debouncedFilters = useDebouncedValue(filters, 300);

  const salesQuery = useQuery({
    queryKey: ['sales', debouncedFilters],
    queryFn: () =>
      salesService.list(cleanFilters(debouncedFilters)),
    enabled: canReadSales,
  });

  const customersQuery = useQuery({
    queryKey: ['sales-customers'],
    queryFn: () => customersService.list(),
    enabled: canReadSales,
  });

  const sellersQuery = useQuery({
    queryKey: ['sales-sellers'],
    queryFn: () => sellersService.list(),
    enabled: canReadSales,
  });

  const paymentTermsQuery = useQuery({
    queryKey: ['sales-payment-terms'],
    queryFn: () => paymentTermsService.list(),
    enabled: canReadSales,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => salesService.cancel(id),
    onSuccess: () => {
      toast.show(t('sales.saleCancelled'), 'success');
      setSaleToCancel(null);
      // Refetch é eventual; o QueryClient mantém o estado de erro das consultas.
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (error: Error) => toast.show(error.message, 'error'),
  });

  const sales = salesQuery.data ?? [];
  const customers = customersQuery.data ?? [];
  const sellers = sellersQuery.data ?? [];
  const paymentTerms = paymentTermsQuery.data ?? [];

  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);
  const sellerMap = useMemo(() => new Map(sellers.map((s) => [s.id, s.name])), [sellers]);
  const paymentTermMap = useMemo(() => new Map(paymentTerms.map((p) => [p.id, p.name])), [paymentTerms]);
  const saleStatusLabels: Record<SaleStatus, string> = useMemo(
    () => ({
      completed: t('customers.purchaseStatusCompleted'),
      cancelled: t('customers.purchaseStatusCancelled'),
      draft: t('customers.purchaseStatusDraft'),
    }),
    [t]
  );

  function cleanFilters(input: FiltersState) {
    const result: Record<string, string> = {};
    (Object.keys(input) as (keyof FiltersState)[]).forEach((key) => {
      const value = input[key];
      if (!value) {
        return;
      }
      result[key] = value;
    });
    return result;
  }

  function updateFilter(key: keyof FiltersState, value: string) {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function handleCancel(sale: Sale) {
    if (sale.status === 'cancelled') return;
    if (!canCancelSales) {
      toast.show(t('common.noPermission'), 'error');
      return;
    }
    setSaleToCancel(sale);
  }

  if (!canReadSales) {
    return (
      <div className="card">
        <h2>{t('sales.heading')}</h2>
        <p>{t('common.noPermission')}</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="toolbar">
        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="sales-filter-from">{t('sales.fromDate')}</label>
            <input
              id="sales-filter-from"
              type="date"
              value={filters.from}
              onChange={(event) => updateFilter('from', event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="sales-filter-to">{t('sales.toDate')}</label>
            <input
              id="sales-filter-to"
              type="date"
              value={filters.to}
              onChange={(event) => updateFilter('to', event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="sales-filter-seller">{t('sellers.heading')}</label>
            <select id="sales-filter-seller" value={filters.seller_id} onChange={(event) => updateFilter('seller_id', event.target.value)}>
              <option value="">{t('common.none')}</option>
              {sellers.map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="sales-filter-customer">{t('customers.heading')}</label>
            <select
              id="sales-filter-customer"
              value={filters.customer_id}
              onChange={(event) => updateFilter('customer_id', event.target.value)}
            >
              <option value="">{t('common.none')}</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="sales-filter-payment-term">{t('paymentTerms.heading')}</label>
            <select
              id="sales-filter-payment-term"
              value={filters.payment_term_id}
              onChange={(event) => updateFilter('payment_term_id', event.target.value)}
            >
              <option value="">{t('common.none')}</option>
              {paymentTerms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <button type="button" className="button secondary" onClick={() => setFilters(defaultFilters)}>
            {t('common.reset') ?? 'Reset'}
          </button>
          {canCheckout && (
            <button type="button" className="button primary" onClick={() => navigate('/pos')} style={{ marginLeft: '0.5rem' }}>
              {t('sales.registerSale')}
            </button>
          )}
        </div>
      </div>

      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>{t('sales.emission')}</th>
              <th>{t('sales.item')}</th>
              <th>{t('sales.customer')}</th>
              <th>{t('sales.seller')}</th>
              <th>{t('sales.paymentTerm')}</th>
              <th>{t('sales.total')}</th>
              <th>{t('sales.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {salesQuery.isLoading && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">{t('common.loading')}</div>
                </td>
              </tr>
            )}
            {salesQuery.isError && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">{(salesQuery.error as Error)?.message ?? t('common.error')}</div>
                </td>
              </tr>
            )}
            {!salesQuery.isLoading && !salesQuery.isError && sales.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">{t('common.empty')}</div>
                </td>
              </tr>
            )}
            {sales.map((sale) => (
              <tr key={sale.id}>
                <td>{formatDateTimeDdMmYyyy(sale.emission_date)}</td>
                <td>{getSalePrimaryItemName(sale)}</td>
                <td>{customerMap.get(sale.customer_id ?? '') ?? '-'}</td>
                <td>{sellerMap.get(sale.seller_id ?? '') ?? '-'}</td>
                <td>{paymentTermMap.get(sale.payment_term_id ?? '') ?? '-'}</td>
                <td>{formatCurrencyBrl(sale.total ?? 0)}</td>
                <td>
                  <span className={`badge ${statusClasses[sale.status]}`}>{saleStatusLabels[sale.status]}</span>
                </td>
                <td style={{ display: 'flex', gap: '0.5rem' }}>
                  <Link className="button secondary" to={`/sales/${sale.id}`}>
                    {t('sales.viewSale')}
                  </Link>
                  <button type="button" className="button secondary" onClick={() => printReceipt(sale.id)} disabled={isPrinting}>
                    {isPrinting ? t('common.loading') : t('sales.printReceipt')}
                  </button>
                  {sale.status !== 'cancelled' && canCancelSales && (
                    <button
                      type="button"
                      className="button danger"
                      onClick={() => handleCancel(sale)}
                      disabled={cancelMutation.isPending}
                    >
                      {t('sales.cancelSale')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={Boolean(saleToCancel)}
        title={t('sales.cancelSale')}
        description={saleToCancel ? `${getSalePrimaryItemName(saleToCancel)} - ${formatCurrencyBrl(saleToCancel.total ?? 0)}` : undefined}
        confirmLabel={t('sales.cancelSale')}
        onClose={() => setSaleToCancel(null)}
        onConfirm={() => {
          if (!saleToCancel) return;
          cancelMutation.mutate(saleToCancel.id);
        }}
        isPending={cancelMutation.isPending}
        tone="danger"
      />
    </div>
  );
}

function getSalePrimaryItemName(sale: Sale) {
  const items = Array.isArray(sale.items) ? sale.items : [];
  if (items.length === 0) {
    return '--';
  }

  const [first, ...rest] = items;
  const base = first.product_name ?? first.product_id;
  if (rest.length === 0) {
    return base;
  }

  return `${base} (+${rest.length})`;
}


