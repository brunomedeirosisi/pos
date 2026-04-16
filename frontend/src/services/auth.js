import { http } from '../api';
export const authService = {
    login: (credentials) => http.post('/auth/login', credentials),
    me: () => http.get('/auth/me'),
};
