export type SaleStatus = 'draft' | 'completed' | 'cancelled';

export type SaleItem = {
  id: string;
  product_id: string;
  quantity: number;
  unit_price: number | null;
  total: number | null;
};

export type Sale = {
  id: string;
  emission_date: string;
  order_number: string | null;
  seller_id: string | null;
  customer_id: string | null;
  payment_term_id: string | null;
  subtotal: number | null;
  discount: number | null;
  total: number | null;
  status: SaleStatus;
  source: string | null;
  source_key: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  items: SaleItem[];
};

export type SaleListFilters = {
  from?: string;
  to?: string;
  seller_id?: string;
  customer_id?: string;
  payment_term_id?: string;
};

export type SaleItemInput = {
  product_id: string;
  quantity: number;
  unit_price: number;
  total?: number | null;
};

export type SaleInput = {
  emission_date?: string;
  order_number?: string | null;
  seller_id?: string | null;
  customer_id?: string | null;
  payment_term_id?: string | null;
  subtotal?: number | null;
  discount?: number | null;
  total?: number | null;
  source?: string | null;
  source_key?: string | null;
  items: SaleItemInput[];
};
