import { http } from '../api';
import type {
  CategoriesMetric,
  DashboardCategoriesResponse,
  DashboardCriticalStockResponse,
  DashboardCustomerKpis,
  DashboardFilterOptions,
  DashboardFilters,
  DashboardPeakHoursResponse,
  DashboardProductAbcResponse,
  DashboardSellerRankingResponse,
  DashboardSalesByDayResponse,
  DashboardSummary,
  DashboardTopProduct,
  PeakHoursMetric,
  ProductAbcMetric,
  SellerRankingSort,
  TopProductMetric,
} from '../types/dashboard';

type QueryRecord = Record<string, string | number | boolean | undefined>;

function toQuery(filters: DashboardFilters): QueryRecord {
  return {
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    timezone: filters.timezone || undefined,
    storeId: filters.storeId || undefined,
    sellerId: filters.sellerId || undefined,
    categoryId: filters.categoryId || undefined,
    channel: filters.channel || undefined,
    paymentTermId: filters.paymentTermId || undefined,
  };
}

export const dashboardService = {
  getFilterOptions: () => http.get<DashboardFilterOptions>('/dashboard/filters'),
  getSummary: (filters: DashboardFilters) => http.get<DashboardSummary>('/dashboard/kpis/summary', toQuery(filters)),
  getCustomers: (filters: DashboardFilters) => http.get<DashboardCustomerKpis>('/dashboard/kpis/customers', toQuery(filters)),
  getCriticalStock: (filters: DashboardFilters) =>
    http.get<DashboardCriticalStockResponse>('/dashboard/kpis/critical-stock', toQuery(filters)),
  getTopProduct: (filters: DashboardFilters, metric: TopProductMetric) =>
    http.get<DashboardTopProduct>('/dashboard/kpis/top-product', { ...toQuery(filters), metric }),
  getSalesByDay: (filters: DashboardFilters, comparePrevious: boolean) =>
    http.get<DashboardSalesByDayResponse>('/dashboard/charts/sales-by-day', { ...toQuery(filters), comparePrevious }),
  getCategories: (filters: DashboardFilters, metric: CategoriesMetric) =>
    http.get<DashboardCategoriesResponse>('/dashboard/charts/categories', { ...toQuery(filters), metric }),
  getPeakHours: (filters: DashboardFilters, metric: PeakHoursMetric) =>
    http.get<DashboardPeakHoursResponse>('/dashboard/charts/peak-hours', { ...toQuery(filters), metric }),
  getSellerRanking: (filters: DashboardFilters, sortBy: SellerRankingSort, limit = 10) =>
    http.get<DashboardSellerRankingResponse>('/dashboard/charts/seller-ranking', { ...toQuery(filters), sortBy, limit }),
  getProductAbc: (filters: DashboardFilters, metric: ProductAbcMetric, limit = 50, offset = 0) =>
    http.get<DashboardProductAbcResponse>('/dashboard/charts/product-abc', { ...toQuery(filters), metric, limit, offset }),
};

