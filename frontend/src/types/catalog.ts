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
