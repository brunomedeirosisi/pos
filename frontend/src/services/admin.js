import { http } from '../api';
export const usersService = {
    list: (search) => http.get('/users', search ? { search } : undefined),
    get: (id) => http.get(`/users/${id}`),
    create: (payload) => http.post('/users', payload),
    update: (id, payload) => http.patch(`/users/${id}`, payload),
    disable: (id) => http.delete(`/users/${id}`),
};
export const rolesService = {
    list: () => http.get('/roles'),
    get: (id) => http.get(`/roles/${id}`),
    create: (payload) => http.post('/roles', payload),
    update: (id, payload) => http.patch(`/roles/${id}`, payload),
    remove: (id) => http.delete(`/roles/${id}`),
};
