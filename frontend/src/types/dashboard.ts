export type DashboardChannel = 'pos' | 'ecommerce' | 'whatsapp' | 'marketplace';
export type CategoriesMetric = 'revenue' | 'quantity' | 'margin';
export type PeakHoursMetric = 'orders' | 'revenue';
export type SellerRankingSort = 'revenue' | 'orders' | 'averageTicket' | 'margin';
export type ProductAbcMetric = 'revenue' | 'quantity' | 'margin';
export type TopProductMetric = 'quantity' | 'revenue';

export type DashboardFilters = {
  startDate: string;
  endDate: string;
  timezone?: string;
  storeId?: string;
  sellerId?: string;
  categoryId?: string;
  channel?: DashboardChannel;
  paymentTermId?: string;
};

export type DashboardFilterOptions = {
  stores: Array<{ id: string; name: string }>;
  sellers: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
  channels: Array<{ id: DashboardChannel | string; name: string }>;
  paymentTerms: Array<{ id: string; name: string }>;
};

export type DashboardSummary = {
  revenueToday: number;
  averageTicket: number;
  ordersToday: number;
  ordersPeriod: number;
  grossMarginPercentage: number;
  missingCostItemsPercentage: number;
};

export type DashboardCategoriesResponse = {
  metric: CategoriesMetric;
  items: Array<{
    categoryId: string | null;
    categoryName: string;
    value: number;
    percentage: number;
    revenue: number;
    quantity: number;
    margin: number;
  }>;
};

export type DashboardSalesByDayItem = {
  date: string;
  revenue: number;
  orders: number;
  averageTicket: number;
  grossMarginPercentage: number;
};

export type DashboardSalesByDayResponse = {
  items: DashboardSalesByDayItem[];
  previousItems: DashboardSalesByDayItem[];
};

export type DashboardPeakHoursResponse = {
  metric: PeakHoursMetric;
  items: Array<{
    weekday: number;
    weekdayName: string;
    hour: number;
    orders: number;
    revenue: number;
  }>;
};

export type DashboardSellerRankingResponse = {
  items: Array<{
    sellerId: string | null;
    sellerName: string;
    revenue: number;
    orders: number;
    averageTicket: number;
    grossMarginPercentage: number;
    participationPercentage: number;
    rank: number;
  }>;
};

export type DashboardProductAbcResponse = {
  metric: ProductAbcMetric;
  total: number;
  items: Array<{
    productId: string;
    productName: string;
    sku: string | null;
    categoryName: string;
    quantitySold: number;
    revenue: number;
    margin: number;
    participationPercentage: number;
    accumulatedPercentage: number;
    abcClass: 'A' | 'B' | 'C';
  }>;
};

export type DashboardTopProduct = {
  productId: string;
  productName: string;
  sku: string | null;
  quantitySold: number;
  revenue: number;
} | null;

export type DashboardCustomerKpis = {
  newCustomers: number;
  returningCustomers: number;
  returningCustomerPercentage: number;
  purchaseFrequency: number;
};

export type DashboardCriticalStockResponse = {
  items: Array<{
    productId: string;
    productName: string;
    sku: string | null;
    currentStock: number;
    minimumStock: number;
    status: 'OK' | 'LOW' | 'OUT_OF_STOCK';
  }>;
};

