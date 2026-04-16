import { http } from '../api';
export const productsService = {
    list: (search) => http.get('/products', search ? { search } : undefined),
    create: (data) => http.post('/products', data),
    update: (id, data) => http.patch(`/products/${id}`, data),
};
export const productGroupsService = {
    list: (search) => http.get('/product-groups', search ? { search } : undefined),
    create: (data) => http.post('/product-groups', data),
    update: (id, data) => http.patch(`/product-groups/${id}`, data),
};
export const customersService = {
    list: (search) => http.get('/customers', search ? { search } : undefined),
    create: (data) => http.post('/customers', data),
    update: (id, data) => http.patch(`/customers/${id}`, data),
    get: (id) => http.get(`/customers/${id}`),
    listPayments: (id, filters) => http.get(`/customers/${id}/payments`, filters),
    registerPayment: (id, data) => http.post(`/customers/${id}/payments`, data),
    getPaymentReceipt: (customerId, paymentId) => http.get(`/customers/${customerId}/payments/${paymentId}/receipt`),
    getPaymentHistoryReport: (id, filters) => http.get(`/customers/${id}/payments/report`, filters),
    listSales: (id) => http.get(`/customers/${id}/sales`),
};
export const sellersService = {
    list: (search) => http.get('/sellers', search ? { search } : undefined),
    create: (data) => http.post('/sellers', data),
    update: (id, data) => http.patch(`/sellers/${id}`, data),
};
export const paymentTermsService = {
    list: (search) => http.get('/payment-terms', search ? { search } : undefined),
    create: (data) => http.post('/payment-terms', data),
    update: (id, data) => http.patch(`/payment-terms/${id}`, data),
};
