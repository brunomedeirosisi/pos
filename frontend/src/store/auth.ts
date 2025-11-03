import { create } from 'zustand';
import { authService } from '../services/auth';
import type { AuthUser, LoginCredentials } from '../types/auth';
import { setAuthToken, onUnauthorized } from '../api';

type AuthState = {
  user: AuthUser | null;
  token: string | null;
  initialized: boolean;
  initializing: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  initialize: () => Promise<void>;
};

const STORAGE_KEY = 'pos.auth.token';

const normalizePermissions = (permission: string | string[]): string[] =>
  Array.isArray(permission) ? permission : [permission];

const hasPermissionInternal = (user: AuthUser | null, required: string | string[]): boolean => {
  if (!user) return false;
  if (user.permissions.includes('*')) return true;
  const needed = normalizePermissions(required);
  return needed.some((perm) => user.permissions.includes(perm));
};

export const hasPermission = (user: AuthUser | null, permission: string | string[]): boolean =>
  hasPermissionInternal(user, permission);

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  initialized: false,
  initializing: false,
  async login(credentials) {
    const { token, user } = await authService.login(credentials);
    localStorage.setItem(STORAGE_KEY, token);
    setAuthToken(token);
    set({ token, user, initialized: true, initializing: false });
  },
  logout() {
    localStorage.removeItem(STORAGE_KEY);
    setAuthToken(null);
    set({ token: null, user: null, initialized: true, initializing: false });
  },
  async initialize() {
    const state = get();
    if (state.initialized || state.initializing) {
      return;
    }
    set({ initializing: true });
    try {
      const storedToken = localStorage.getItem(STORAGE_KEY);
      if (!storedToken) {
        setAuthToken(null);
        set({ token: null, user: null });
        return;
      }

      setAuthToken(storedToken);
      const { user } = await authService.me();
      set({ token: storedToken, user });
    } catch (error) {
      localStorage.removeItem(STORAGE_KEY);
      setAuthToken(null);
      set({ token: null, user: null });
    } finally {
      set({ initializing: false, initialized: true });
    }
  },
}));

onUnauthorized(() => {
  const state = useAuthStore.getState();
  if (state.token) {
    state.logout();
  }
});

export const useHasPermission = (permission: string | string[]): boolean =>
  useAuthStore((state) => hasPermissionInternal(state.user, permission));



