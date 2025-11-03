import { http } from '../api';
import type { AuthUser, LoginCredentials, LoginResponse } from '../types/auth';

export const authService = {
  login: (credentials: LoginCredentials) => http.post<LoginResponse>('/auth/login', credentials),
  me: () => http.get<{ user: AuthUser }>('/auth/me'),
};
