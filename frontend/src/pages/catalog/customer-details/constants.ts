import { formatDateDdMmYyyy } from '../../../utils/date';

export const paymentMethodOptions = ['cash', 'card', 'bank', 'other'] as const;
export const paymentMethodFilterOptions = ['all', 'cash', 'card', 'bank', 'other', 'legacy'] as const;

export const defaultPaymentFilters = {
  start_date: '',
  end_date: '',
  method: 'all' as (typeof paymentMethodFilterOptions)[number],
  sort: 'desc' as 'asc' | 'desc',
};

const currencyFormatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'BRL' });

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-';
  return currencyFormatter.format(value);
}

export function formatDate(value: string | null | undefined): string {
  return formatDateDdMmYyyy(value);
}
