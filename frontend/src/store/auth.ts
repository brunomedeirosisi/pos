import { create } from 'zustand';
import { authService } from '../services/auth';
import type { AuthUser, LoginCredentials } from '../types/auth';
import { onUnauthorized } from '../api';
import { queryClient } from '../lib/queryClient';
import { usePosStore } from './pos';
import { advanceSessionGeneration, currentSessionGeneration } from '../lib/session-lifecycle';

type AuthState = {
  user: AuthUser | null;
  initialized: boolean;
  initializing: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
};

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
  initialized: false,
  initializing: false,
  async login(credentials) {
    if (pendingLogout) await pendingLogout;
    set({ user: null, initialized: true, initializing: true });
    const generation = clearPrivateState();
    try {
      const { user } = await authService.login(credentials);
      if (generation !== currentSessionGeneration()) return;
      setLogoutPending(false);
      set({ user, initialized: true, initializing: false });
      notifyOtherTabs('login');
    } catch (error) {
      if (generation === currentSessionGeneration()) set({ user: null, initialized: true, initializing: false });
      throw error;
    }
  },
  async logout() {
    if (pendingLogout) return pendingLogout;
    set({ user: null, initialized: true, initializing: false });
    clearPrivateState();
    setLogoutPending(true);
    notifyOtherTabs('logout');
    if (!pendingLogout) {
      pendingLogout = authService.logout()
        .then(() => setLogoutPending(false))
        .catch(() => { /* Keep the logout marker; a reload must not silently restore the cookie. */ })
        .finally(() => { pendingLogout = null; });
    }
    await pendingLogout;
  },
  async initialize() {
    const state = get();
    if (state.initialized || state.initializing) {
      return;
    }
    set({ initializing: true });
    const generation = currentSessionGeneration();
    try {
      if (logoutIsPending()) {
        await authService.logout();
        setLogoutPending(false);
        return;
      }
      const { user } = await authService.me();
      if (generation === currentSessionGeneration()) set({ user });
    } catch {
      if (generation === currentSessionGeneration()) set({ user: null });
    } finally {
      if (generation === currentSessionGeneration()) set({ initializing: false, initialized: true });
    }
  },
}));

let pendingLogout: Promise<void> | null = null;
let memoryLogoutPending = false;
const logoutKey = 'pos.logoutPending';
const changeKey = 'pos.auth.change';

function setLogoutPending(value: boolean): void {
  memoryLogoutPending = value;
  try {
    if (value) localStorage.setItem(logoutKey, '1'); else localStorage.removeItem(logoutKey);
  } catch { /* Storage may be unavailable in a restricted browser. */ }
}

function logoutIsPending(): boolean {
  try { return memoryLogoutPending || localStorage.getItem(logoutKey) === '1'; } catch { return memoryLogoutPending; }
}

function clearPrivateState(): number {
  const generation = advanceSessionGeneration();
  // A limpeza local é imediata; o QueryClient trata cancelamentos em segundo plano.
  void queryClient.cancelQueries();
  queryClient.clear();
  usePosStore.getState().reset();
  return generation;
}

function notifyOtherTabs(kind: 'login' | 'logout'): void {
  try { localStorage.setItem(changeKey, JSON.stringify({ kind, nonce: `${Date.now()}-${Math.random()}` })); } catch { /* Same-tab controls still apply. */ }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== changeKey || !event.newValue) return;
    try {
      const { kind } = JSON.parse(event.newValue) as { kind: string };
      if (kind !== 'login' && kind !== 'logout') return;
      clearPrivateState();
      useAuthStore.setState({ user: null, initialized: kind === 'logout', initializing: false });
      // initialize já trata falhas; a notificação entre abas não aguarda a rede.
      if (kind === 'login') void useAuthStore.getState().initialize();
    } catch { /* Ignore unrelated/malformed storage messages. */ }
  });
}

onUnauthorized(() => {
  const state = useAuthStore.getState();
  if (state.user) {
    // logout já trata falhas e mantém o marcador; o callback 401 não aguarda a rede.
    void state.logout();
  }
});

export const useHasPermission = (permission: string | string[]): boolean =>
  useAuthStore((state) => hasPermissionInternal(state.user, permission));



