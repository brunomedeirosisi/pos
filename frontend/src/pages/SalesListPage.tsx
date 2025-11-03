import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { salesService } from '../services/sales';
import { customersService, sellersService, paymentTermsService } from '../services/catalog';
import type { Sale, SaleStatus } from '../types/sales';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useToast } from '../components/ui/ToastProvider';
import { useHasPermission } from '../store/auth';

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

  const [filters, setFilters] = useState<FiltersState>(defaultFilters);
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
      queryClient.invalidateQueries({ queryKey: ['sales'] });
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

  function cleanFilters(input: FiltersState) {
    const result: Record<string, string> = {};
    (Object.keys(input) as (keyof FiltersState)[]).forEach((key) => {
      const value = input[key];
      if (value) {
        result[key] = value;
      }
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
    cancelMutation.mutate(sale.id);
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
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            type="date"
            value={filters.from}
            onChange={(event) => updateFilter('from', event.target.value)}
          />
          <input
            type="date"
            value={filters.to}
            onChange={(event) => updateFilter('to', event.target.value)}
          />
          <select value={filters.seller_id} onChange={(event) => updateFilter('seller_id', event.target.value)}>
            <option value="">{t('sellers.heading')}</option>
            {sellers.map((seller) => (
              <option key={seller.id} value={seller.id}>
                {seller.name}
              </option>
            ))}
          </select>
          <select value={filters.customer_id} onChange={(event) => updateFilter('customer_id', event.target.value)}>
            <option value="">{t('customers.heading')}</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
          <select
            value={filters.payment_term_id}
            onChange={(event) => updateFilter('payment_term_id', event.target.value)}
          >
            <option value="">{t('paymentTerms.heading')}</option>
            {paymentTerms.map((term) => (
              <option key={term.id} value={term.id}>
                {term.name}
              </option>
            ))}
          </select>
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

      <div style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>{t('sales.emission')}</th>
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
                <td colSpan={7}>
                  <div className="empty-state">{t('common.loading')}</div>
                </td>
              </tr>
            )}
            {salesQuery.isError && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">{(salesQuery.error as Error)?.message ?? 'Error'}</div>
                </td>
              </tr>
            )}
            {!salesQuery.isLoading && !salesQuery.isError && sales.length === 0 && (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">{t('common.empty')}</div>
                </td>
              </tr>
            )}
            {sales.map((sale) => (
              <tr key={sale.id}>
                <td>{sale.emission_date}</td>
                <td>{customerMap.get(sale.customer_id ?? '') ?? '-'}</td>
                <td>{sellerMap.get(sale.seller_id ?? '') ?? '-'}</td>
                <td>{paymentTermMap.get(sale.payment_term_id ?? '') ?? '-'}</td>
                <td>R$ {(sale.total ?? 0).toFixed(2)}</td>
                <td>
                  <span className={`badge ${statusClasses[sale.status]}`}>{sale.status}</span>
                </td>
                <td style={{ display: 'flex', gap: '0.5rem' }}>
                  <Link className="button secondary" to={`/sales/${sale.id}`}>
                    {t('sales.viewSale')}
                  </Link>
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

      <Outlet />
    </div>
  );
}

