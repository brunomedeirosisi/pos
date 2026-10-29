import { http } from '../api';
import type { CustomerPayment, CustomerPaymentReceipt } from '../types/catalog';

export type PaymentHistoryEntry = CustomerPayment & { customer_id: string; customer_name: string };
export type PaymentHistoryFilters = {
  from?: string;
  to?: string;
  received_by?: string;
  customer_id?: string;
  page?: number;
  page_size?: number;
};
export type PaymentHistoryResponse = {
  payments: PaymentHistoryEntry[];
  pagination: { page: number; page_size: number; total_items: number; total_pages: number };
};

export const paymentHistoryService = {
  list: (filters: PaymentHistoryFilters) => http.get<PaymentHistoryResponse>('/payments', filters),
  receivers: () => http.get<{ id: string; full_name: string }[]>('/payments/receivers'),
  get: (id: string) => http.get<CustomerPaymentReceipt>(`/payments/${encodeURIComponent(id)}`),
  cancel: (id: string, reason?: string) =>
    http.post<{ payment: PaymentHistoryEntry; current_balance: number }>(`/payments/${encodeURIComponent(id)}/cancel`, {
      reason,
    }),
};

export function openPaymentReceipt(payment: Pick<PaymentHistoryEntry, 'customer_id' | 'id'>): void {
  window.open(
    `/catalog/customers/${encodeURIComponent(payment.customer_id)}/payments/${encodeURIComponent(payment.id)}/receipt`,
    '_blank',
    'noopener,noreferrer'
  );
}
