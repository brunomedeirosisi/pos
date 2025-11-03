import { http } from '../api';
import type { Sale, SaleInput, SaleListFilters } from '../types/sales';

export const salesService = {
  list: (filters?: SaleListFilters) => http.get<Sale[]>('/sales', filters),
  get: (id: string) => http.get<Sale>(`/sales/${id}`),
  create: (data: SaleInput) => http.post<Sale>('/sales', data),
  cancel: (id: string, reason?: string) => http.post<Sale>(`/sales/${id}/cancel`, reason ? { reason } : undefined),
};
