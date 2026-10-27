export type SaleStatus = 'draft' | 'completed' | 'cancelled';
export type SalePaymentMethod = 'cash' | 'card' | 'bank' | 'other' | 'credit' | 'credit_with_entry';
export type SaleReceiptLocale = 'pt-BR' | 'en';

export type SaleItem = {
  id: string;
  product_id: string;
  product_name?: string | null;
  quantity: number;
  unit_price: number | null;
  total: number | null;
};

export type Sale = {
  id: string;
  emission_date: string;
  paid_at: string | null;
  order_number: string | null;
  seller_id: string | null;
  customer_id: string | null;
  payment_term_id: string | null;
  payment_method: SalePaymentMethod | null;
  amount_paid: number | null;
  change_amount: number | null;
  subtotal: number | null;
  discount: number | null;
  total: number | null;
  pending_amount: number | null;
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
  page?: number;
  page_size?: number;
  limit?: number;
};

export type SaleItemInput = {
  product_id: string;
  quantity: number;
  unit_price: number;
  total?: number | null;
};

export type SaleInput = {
  emission_date?: string;
  paid_at?: string;
  order_number?: string | null;
  seller_id?: string | null;
  customer_id?: string | null;
  payment_term_id?: string | null;
  payment_method: SalePaymentMethod;
  amount_paid: number;
  change_amount?: number | null;
  subtotal?: number | null;
  discount?: number | null;
  total?: number | null;
  source?: string | null;
  source_key?: string | null;
  items: SaleItemInput[];
};

export type SaleReceipt = {
  company: {
    name: string;
    address: string;
    tax_id: string;
  };
  sale: {
    id: string;
    code: string;
    emission_date: string;
    paid_at: string | null;
    order_number: string | null;
    status: SaleStatus;
    subtotal: number;
    discount: number;
    total: number;
    pending_amount: number;
    payment_method: SalePaymentMethod | null;
    payment_term_name: string | null;
    amount_paid: number | null;
    change_amount: number | null;
  };
  customer: {
    id: string;
    legacy_code: string | null;
    name: string;
    cpf: string | null;
  } | null;
  seller: {
    id: string;
    name: string;
  } | null;
  items: SaleItem[];
  generated_at: string;
  plain_text: string;
};

export type PrintSaleReceiptInput = {
  printer_id?: string;
  request_id?: string;
  locale?: SaleReceiptLocale;
  copies?: number;
};

export type PrintSaleReceiptResult = {
  receipt_code: string;
  printer_model: string;
  printed_at?: string;
  job_id?: string;
  status?: PrintJob['status'];
  requested_at?: string;
  copies: number;
};

export type PrintJob = {
  printer_id: string;
  printer_name: string;
  job_id: string;
  sale_id: string;
  status: 'queued' | 'claimed' | 'spooling' | 'submitted' | 'failed' | 'uncertain';
  copies: number;
  receipt_code: string;
  requested_at: string;
  finished_at: string | null;
  result_code: string | null;
};
