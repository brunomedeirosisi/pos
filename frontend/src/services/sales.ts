import { http } from '../api';
import type {
  PrintSaleReceiptInput,
  PrintSaleReceiptResult,
  PrintJob,
  Sale,
  SaleInput,
  SaleListFilters,
  SaleReceipt,
  SaleReceiptLocale,
} from '../types/sales';

export const salesService = {
  list: (filters?: SaleListFilters) => http.get<Sale[]>('/sales', filters),
  get: (id: string) => http.get<Sale>(`/sales/${id}`),
  create: (data: SaleInput) => http.post<Sale>('/sales', data),
  getReceipt: (id: string, locale?: SaleReceiptLocale) =>
    http.get<SaleReceipt>(`/sales/${id}/receipt`, locale ? { locale } : undefined),
  printReceipt: (id: string, data?: PrintSaleReceiptInput) =>
    http.post<PrintSaleReceiptResult>(`/sales/${id}/receipt/print`, data),
  printJob: (id: string) => http.get<PrintJob>(`/print-jobs/${id}`),
  printJobs: (saleId: string) => http.get<PrintJob[]>(`/print-jobs/sale/${saleId}`),
  cancel: (id: string, reason?: string) => http.post<Sale>(`/sales/${id}/cancel`, reason ? { reason } : undefined),
};
