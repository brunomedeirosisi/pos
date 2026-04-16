import { http } from '../api';
export const salesService = {
    list: (filters) => http.get('/sales', filters),
    get: (id) => http.get(`/sales/${id}`),
    create: (data) => http.post('/sales', data),
    cancel: (id, reason) => http.post(`/sales/${id}/cancel`, reason ? { reason } : undefined),
};
