import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const service = vi.hoisted(() => ({ login: vi.fn(), logout: vi.fn(), me: vi.fn() }));
vi.mock('../services/auth', () => ({ authService: service }));
import { useAuthStore } from './auth';
import { usePosStore } from './pos';
import { queryClient } from '../lib/queryClient';
const user = { id: 'operator-a', email: 'a@example.com', fullName: 'A', role: 'admin', permissions: ['*'], discountLimit: 100 };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => { vi.clearAllMocks(); service.logout.mockResolvedValue(undefined); useAuthStore.setState({ user, initialized: true, initializing: false }); });
afterEach(async () => { service.logout.mockResolvedValue(undefined); await useAuthStore.getState().logout(); queryClient.clear(); });
describe('operator isolation', () => {
  it('clears private queries, mutations and the cart immediately even when logout is offline', async () => {
    queryClient.setQueryData(['customers'], [{ name: 'private' }]);
    queryClient.getMutationCache().build(queryClient, { mutationFn: async () => 'private' });
    usePosStore.setState({ customerId: 'customer-a', sellerId: 'seller-a', discount: 10, items: [{ productId: 'p', name: 'Private', priceCash: 10, priceBase: 10, unitPrice: 10, quantity: 1, total: 10 }] });
    const offline = deferred<void>(); service.logout.mockReturnValueOnce(offline.promise);
    const operation = useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    expect(usePosStore.getState()).toMatchObject({ items: [], customerId: null, sellerId: null, discount: 0 });
    offline.resolve(); await operation;
  });
  it('ignores a late initialization response after logout', async () => {
    const response = deferred<{ user: typeof user }>(); service.me.mockReturnValueOnce(response.promise);
    useAuthStore.setState({ user: null, initialized: false });
    const initialization = useAuthStore.getState().initialize();
    await useAuthStore.getState().logout(); response.resolve({ user }); await initialization;
    expect(useAuthStore.getState().user).toBeNull();
  });
  it('waits for pending logout before a new login can set another cookie', async () => {
    const response = deferred<void>(); service.logout.mockReturnValueOnce(response.promise);
    const logout = useAuthStore.getState().logout();
    service.login.mockResolvedValueOnce({ user: { ...user, id: 'operator-b' } });
    const login = useAuthStore.getState().login({ email: 'b@example.com', password: 'synthetic' });
    expect(service.login).not.toHaveBeenCalled(); response.resolve(); await logout; await login;
    expect(useAuthStore.getState().user?.id).toBe('operator-b');
  });
  it('does not restore the old cookie after a failed offline logout', async () => {
    service.logout.mockRejectedValueOnce(new Error('offline'));
    await useAuthStore.getState().logout();
    useAuthStore.setState({ initialized: false });
    await useAuthStore.getState().initialize();
    expect(service.me).not.toHaveBeenCalled(); expect(useAuthStore.getState().user).toBeNull();
  });
});
