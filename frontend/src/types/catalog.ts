export type Product = {
  id: string;
  legacy_code: string | null;
  name: string;
  barcode: string | null;
  group_id: string | null;
  reference: string | null;
  min_stock: number | null;
  price_cash: number | null;
  price_base: number | null;
};

export type ProductInput = {
  legacy_code?: string | null;
  name: string;
  barcode?: string | null;
  group_id?: string | null;
  reference?: string | null;
  min_stock?: number | null;
  price_cash?: number | null;
  price_base?: number | null;
};

export type ProductGroup = {
  id: string;
  legacy_code: string | null;
  name: string;
};

export type ProductGroupInput = {
  legacy_code?: string | null;
  name: string;
};

export type CustomerStatus = 'active' | 'delinquent' | 'inactive';

export type Customer = {
  id: string;
  legacy_code: string | null;
  name: string;
  cpf: string | null;
  address: string | null;
  city: string | null;
  uf: string | null;
  cep: string | null;
  phone: string | null;
  status: CustomerStatus;
  credit_limit: number | null;
  notes: string | null;
};

export type CustomerInput = {
  legacy_code?: string | null;
  name: string;
  cpf?: string | null;
  address?: string | null;
  city?: string | null;
  uf?: string | null;
  cep?: string | null;
  phone?: string | null;
  status?: CustomerStatus;
  credit_limit?: number | null;
  notes?: string | null;
};

export type CustomerTotals = {
  total_charges: number;
  total_payments: number;
  current_balance: number;
  last_payment_date: string | null;
};

export type CustomerDetails = Customer & {
  totals: CustomerTotals;
};

export type CustomerPaymentMethod = 'cash' | 'card' | 'bank' | 'other' | 'legacy';

export type CustomerPayment = {
  id: string;
  amount: number;
  payment_date: string | null;
  method: CustomerPaymentMethod;
  reference: string | null;
  notes: string | null;
  received_by: string | null;
  received_by_name: string | null;
  source: 'manual' | 'legacy';
  created_at: string | null;
};

export type CustomerPaymentInput = {
  amount: number;
  payment_date?: string | null;
  method?: Exclude<CustomerPaymentMethod, 'legacy'>;
  reference?: string | null;
  notes?: string | null;
};

export type CustomerPaymentsFilters = {
  start_date?: string;
  end_date?: string;
  method?: CustomerPaymentMethod;
  sort?: 'asc' | 'desc';
  page?: number;
  page_size?: number;
  limit?: number;
};

export type CustomerPaymentsSummary = {
  total_debt: number;
  total_paid: number;
  current_balance: number;
  filtered_total_paid: number;
  filtered_count: number;
  applied_filters: {
    start_date: string | null;
    end_date: string | null;
    method: CustomerPaymentMethod | null;
    sort: 'asc' | 'desc';
  };
};

export type CustomerPaymentsResponse = {
  payments: CustomerPayment[];
  summary: CustomerPaymentsSummary;
  pagination?: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
};

export type CustomerPaymentRegisterResponse = {
  payment: CustomerPayment;
  summary: {
    total_debt: number;
    total_paid: number;
    previous_balance: number;
    new_balance: number;
  };
  receipt_hint?: string;
};

export type CompanyInfo = {
  name: string;
  address: string;
  tax_id: string;
};

export type CustomerSummary = Pick<
  Customer,
  'id' | 'legacy_code' | 'name' | 'cpf' | 'address' | 'city' | 'uf' | 'cep' | 'phone'
>;

export type CustomerPaymentReceipt = {
  company: CompanyInfo;
  customer: CustomerSummary;
  payment: CustomerPayment & { code: string };
  balances: {
    total_debt: number;
    total_paid: number;
    previous_balance: number;
    payment_amount: number;
    new_balance: number;
  };
  generated_at: string;
};

export type CustomerPaymentHistoryReport = {
  generated_at: string;
  company: CompanyInfo;
  customer: CustomerSummary;
  payments: CustomerPayment[];
  summary: CustomerPaymentsSummary;
};

export type CustomerSale = {
  id: string;
  emission_date: string | null;
  order_number: string | null;
  total: number | null;
  status: 'draft' | 'completed' | 'cancelled';
};

export type Seller = {
  id: string;
  legacy_code: string | null;
  name: string;
};

export type SellerInput = {
  legacy_code?: string | null;
  name: string;
};

export type PaymentTerm = {
  id: string;
  legacy_code: string | null;
  name: string;
};

export type PaymentTermInput = {
  legacy_code?: string | null;
  name: string;
};
