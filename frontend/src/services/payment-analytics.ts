import { http } from "../api";
import type { ListFilters, Page } from "./lists";
import type {
  PaymentFilters,
  PaymentSummary,
  PaymentTransaction,
  PaymentRanking,
} from "../types/payment-analytics";

export const paymentAnalyticsService = {
  options: (signal?: AbortSignal) =>
    http.get<{ timezone: string; today: string }>(
      "/dashboard/payments/options",
      undefined,
      { signal },
    ),
  summary: (filters: PaymentFilters, grouping: string, signal?: AbortSignal) =>
    http.get<PaymentSummary>(
      "/dashboard/payments/summary",
      { ...filters, grouping },
      { signal },
    ),
  transactions: (filters: ListFilters) =>
    http.get<Page<PaymentTransaction>>(
      "/dashboard/payments/transactions",
      filters,
    ),
  customers: (filters: ListFilters) =>
    http.get<Page<PaymentRanking>>("/dashboard/payments/customers", filters),
  employees: (filters: ListFilters) =>
    http.get<Page<PaymentRanking>>("/dashboard/payments/employees", filters),
  export: (filters: ListFilters, locale: string) =>
    http.getBlob("/dashboard/payments/export", { ...filters, locale }),
};
