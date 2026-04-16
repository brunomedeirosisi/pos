import { create } from 'zustand';
import { authService } from '../services/auth';
import { setAuthToken, onUnauthorized } from '../api';
const STORAGE_KEY = 'pos.auth.token';
const normalizePermissions = (permission) => Array.isArray(permission) ? permission : [permission];
const hasPermissionInternal = (user, required) => {
    if (!user)
        return false;
    if (user.permissions.includes('*'))
        return true;
    const needed = normalizePermissions(required);
    return needed.some((perm) => user.permissions.includes(perm));
};
export const hasPermission = (user, permission) => hasPermissionInternal(user, permission);
export const useAuthStore = create((set, get) => ({
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
        }
        catch (error) {
            localStorage.removeItem(STORAGE_KEY);
            setAuthToken(null);
            set({ token: null, user: null });
        }
        finally {
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
export const useHasPermission = (permission) => useAuthStore((state) => hasPermissionInternal(state.user, permission));
