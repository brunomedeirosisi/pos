import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ user: { id: 'synthetic', permissions: ['catalog:read'] as string[] } }));
vi.mock('../../store/auth', () => ({
  useAuthStore: (selector: (value: typeof state) => unknown) => selector(state),
  hasPermission: (user: typeof state.user, permission: string | string[]) => user.permissions.includes('*') || (Array.isArray(permission) ? permission : [permission]).some((p) => user.permissions.includes(p)),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
import { RequirePermission } from './RequirePermission';
function render(url: string) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={[url]}><Routes>
    <Route path="catalog/customers/:id/payments/:paymentId/receipt" element={<RequirePermission permission="catalog:read"><p>receipt permitted</p></RequirePermission>} />
    <Route path="admin/users" element={<RequirePermission permission="users:read"><PrivatePage /></RequirePermission>} />
  </Routes></MemoryRouter>);
}
function PrivatePage() { throw new Error('Unauthorized page must never mount'); return <p>private</p>; }
describe('declarative routing compatibility and permissions', () => {
  it('matches a deep parameterized receipt route with the upgraded router', () => { expect(render('/catalog/customers/customer-a/payments/payment-a/receipt')).toContain('receipt permitted'); });
  it('blocks a directly entered admin URL before the private page mounts', () => { expect(render('/admin/users')).toContain('common.noPermission'); });
});
