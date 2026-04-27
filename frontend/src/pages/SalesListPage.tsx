import React, { useMemo, useRef, useState } from 'react';
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

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function normalizeDateFilter(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const brMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const day = Number(brMatch[1]);
    const month = Number(brMatch[2]);
    const year = Number(brMatch[3]);
    if (!isValidDateParts(year, month, day)) {
      return null;
    }
    return `${year}-${pad2(month)}-${pad2(day)}`;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (!isValidDateParts(year, month, day)) {
      return null;
    }
    return trimmed;
  }

  return null;
}

function formatDateFilterDisplayFromIso(value: string): string {
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!isoMatch) {
    return value;
  }
  return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
}

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
  const fromDatePickerRef = useRef<HTMLInputElement | null>(null);
  const toDatePickerRef = useRef<HTMLInputElement | null>(null);

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
      if (!value) {
        return;
      }

      if (key === 'from' || key === 'to') {
        const normalizedDate = normalizeDateFilter(value);
        if (normalizedDate) {
          result[key] = normalizedDate;
        }
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

  function openDatePicker(ref: React.RefObject<HTMLInputElement | null>) {
    const input = ref.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
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
            type="text"
            inputMode="numeric"
            placeholder="dd/mm/yyyy"
            value={filters.from}
            onChange={(event) => updateFilter('from', event.target.value)}
            onFocus={() => openDatePicker(fromDatePickerRef)}
            onClick={() => openDatePicker(fromDatePickerRef)}
          />
          <input
            ref={fromDatePickerRef}
            type="date"
            className="sales-date-picker-native"
            value={normalizeDateFilter(filters.from) ?? ''}
            onChange={(event) => updateFilter('from', formatDateFilterDisplayFromIso(event.target.value))}
            tabIndex={-1}
            aria-hidden="true"
          />
          <input
            type="text"
            inputMode="numeric"
            placeholder="dd/mm/yyyy"
            value={filters.to}
            onChange={(event) => updateFilter('to', event.target.value)}
            onFocus={() => openDatePicker(toDatePickerRef)}
            onClick={() => openDatePicker(toDatePickerRef)}
          />
          <input
            ref={toDatePickerRef}
            type="date"
            className="sales-date-picker-native"
            value={normalizeDateFilter(filters.to) ?? ''}
            onChange={(event) => updateFilter('to', formatDateFilterDisplayFromIso(event.target.value))}
            tabIndex={-1}
            aria-hidden="true"
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
                  <div className="empty-state">{(salesQuery.error as Error)?.message ?? 'Error'}</div>
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

