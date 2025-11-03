import { http } from '../api';
import type {
  Product,
  ProductInput,
  ProductGroup,
  ProductGroupInput,
  Customer,
  CustomerInput,
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
