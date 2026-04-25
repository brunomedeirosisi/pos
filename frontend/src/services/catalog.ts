import { http } from '../api';
import type {
  Product,
  ProductInput,
  ProductGroup,
  ProductGroupInput,
  Customer,
  CustomerInput,
  CustomerDetails,
  CustomerPayment,
  CustomerPaymentInput,
  CustomerPaymentsFilters,
  CustomerPaymentsResponse,
  CustomerPaymentRegisterResponse,
  CustomerPaymentReceipt,
  CustomerPaymentHistoryReport,
  CustomerSale,
  Seller,
  SellerInput,
  PaymentTerm,
  PaymentTermInput,
} from '../types/catalog';

export const productsService = {
  list: (search?: string) => http.get<Product[]>('/products', search ? { search } : undefined),
  create: (data: ProductInput) => http.post<Product>('/products', data),
  update: (id: string, data: Partial<ProductInput>) => http.patch<Product>(`/products/${id}`, data),
};

export const productGroupsService = {
  list: (search?: string) => http.get<ProductGroup[]>('/product-groups', search ? { search } : undefined),
  create: (data: ProductGroupInput) => http.post<ProductGroup>('/product-groups', data),
  update: (id: string, data: Partial<ProductGroupInput>) => http.patch<ProductGroup>(`/product-groups/${id}`, data),
};

export const customersService = {
  list: (search?: string) => http.get<Customer[]>('/customers', search ? { search } : undefined),
  create: (data: CustomerInput) => http.post<Customer>('/customers', data),
  update: (id: string, data: Partial<CustomerInput>) => http.patch<Customer>(`/customers/${id}`, data),
  get: (id: string) => http.get<CustomerDetails>(`/customers/${id}`),
  listPayments: (id: string, filters?: CustomerPaymentsFilters) =>
    http.get<CustomerPaymentsResponse>(`/customers/${id}/payments`, filters),
  registerPayment: (id: string, data: CustomerPaymentInput) =>
    http.post<CustomerPaymentRegisterResponse>(`/customers/${id}/payments`, data),
  getPaymentReceipt: (customerId: string, paymentId: string) =>
    http.get<CustomerPaymentReceipt>(`/customers/${customerId}/payments/${paymentId}/receipt`),
  getPaymentHistoryReport: (id: string, filters?: CustomerPaymentsFilters) =>
    http.get<CustomerPaymentHistoryReport>(`/customers/${id}/payments/report`, filters),
  listSales: (id: string) => http.get<CustomerSale[]>(`/customers/${id}/sales`),
};

export const sellersService = {
  list: (search?: string) => http.get<Seller[]>('/sellers', search ? { search } : undefined),
  create: (data: SellerInput) => http.post<Seller>('/sellers', data),
  update: (id: string, data: Partial<SellerInput>) => http.patch<Seller>(`/sellers/${id}`, data),
};

export const paymentTermsService = {
  list: (search?: string) => http.get<PaymentTerm[]>('/payment-terms', search ? { search } : undefined),
  create: (data: PaymentTermInput) => http.post<PaymentTerm>('/payment-terms', data),
  update: (id: string, data: Partial<PaymentTermInput>) => http.patch<PaymentTerm>(`/payment-terms/${id}`, data),
};
