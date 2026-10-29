// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentHistoryPage } from './PaymentHistoryPage';
import { CustomerPaymentReceiptPage } from './catalog/CustomerPaymentReceiptPage';
import { paymentHistoryService, type PaymentHistoryEntry } from '../services/paymentHistory';
import { customersService } from '../services/catalog';
import { useAuthStore } from '../store/auth';
import { parseApiErrorMessage } from '../api';
import i18n, { resources } from '../lib/i18n';

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('../components/ui/ToastProvider', () => ({ useToast: () => ({ show: showToast }) }));
const customerId = '0329e239-c0ca-4500-8b08-a8411c044ed8';
const receiverId = '35eebd64-d3fe-451d-973a-cf76e1d790a5';
const active: PaymentHistoryEntry = {
  id: 'ef628421-5bd4-49d5-88e0-f4b88dbdb70f',
  customer_id: customerId,
  customer_name: 'Synthetic customer',
  amount: 40,
  payment_date: '2026-10-25',
  method: 'cash',
  received_by: receiverId,
  received_by_name: 'Synthetic receiver',
  source: 'manual',
  reference: null,
  notes: 'Synthetic notes',
  created_at: '2026-10-25T12:00:00Z',
  cancelled_at: null,
};
const cancelled: PaymentHistoryEntry = {
  ...active,
  id: '9733a316-8752-4afc-96e3-31c14089dfb5',
  cancelled_at: '2026-10-29T12:00:00Z',
  cancelled_by_name: 'Synthetic manager',
  cancellation_reason: 'Synthetic correction',
};
function result(payments = [active, cancelled], page = 1, totalPages = 1) {
  return { payments, pagination: { page, page_size: 50, total_items: payments.length, total_pages: totalPages } };
}
function receipt(payment = active) {
  return {
    company: { name: 'Synthetic company', address: '', tax_id: '' },
    customer: {
      id: customerId,
      name: 'Synthetic customer',
      legacy_code: null,
      cpf: null,
      address: null,
      city: null,
      uf: null,
      cep: null,
      phone: null,
    },
    payment: { ...payment, code: 'REC-SYNTHETIC' },
    balances: { total_debt: 100, total_paid: 40, previous_balance: 100, payment_amount: 40, new_balance: 60 },
    generated_at: '2026-10-29T12:00:00Z',
  };
}
let container: HTMLDivElement, root: Root, client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useAuthStore.setState({
    user: {
      id: receiverId,
      email: 'synthetic@example.test',
      fullName: 'Synthetic receiver',
      role: 'admin',
      permissions: ['*'],
      discountLimit: 100,
    },
  });
  vi.spyOn(paymentHistoryService, 'list').mockResolvedValue(result());
  vi.spyOn(paymentHistoryService, 'receivers').mockResolvedValue([{ id: receiverId, full_name: 'Synthetic receiver' }]);
  vi.spyOn(paymentHistoryService, 'get').mockResolvedValue(receipt());
  vi.spyOn(paymentHistoryService, 'cancel').mockResolvedValue({
    payment: { ...active, cancelled_at: cancelled.cancelled_at },
    current_balance: 100,
  });
  vi.spyOn(customersService, 'list').mockResolvedValue([
    {
      id: customerId,
      name: 'Synthetic customer',
      legacy_code: null,
      cpf: null,
      address: null,
      city: null,
      uf: null,
      cep: null,
      phone: null,
      status: 'active',
      credit_limit: null,
      notes: null,
    },
  ]);
  vi.spyOn(window, 'open').mockReturnValue(null);
  vi.spyOn(window, 'print').mockImplementation(() => {});
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  client.clear();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  showToast.mockClear();
});
async function flush(milliseconds = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
}
async function render(locale = 'pt-BR', path = '/payments/history') {
  await i18n.changeLanguage(locale);
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/payments/history" element={<PaymentHistoryPage />} />
            <Route path="/payments/:paymentId" element={<CustomerPaymentReceiptPage />} />
            <Route
              path="/catalog/customers/:customerId/payments/:paymentId/receipt"
              element={<CustomerPaymentReceiptPage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  });
  await flush();
}
function button(key: string, parent: ParentNode = container) {
  return Array.from(parent.querySelectorAll('button')).find((element) => element.textContent === i18n.t(key))!;
}
async function click(element: HTMLElement) {
  await act(async () => element.click());
  await flush();
}
async function change(id: string, value: string) {
  const element = document.getElementById(id)! as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
  const prototype =
    element.tagName === 'SELECT'
      ? HTMLSelectElement.prototype
      : element.tagName === 'TEXTAREA'
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

async function chooseFilter(id: string, label: string) {
  await act(async () => document.getElementById(id)!.focus());
  const option = Array.from(container.querySelectorAll<HTMLElement>('[role="option"]')).find(
    (item) => item.textContent === label
  )!;
  await click(option);
}

describe.each(['pt-BR', 'en'])('payment history in %s', (locale) => {
  it('provides four horizontal filters, sends their values and clears them without a payment-term filter', async () => {
    await render(locale);
    expect(container.querySelectorAll('.history-filters .form-group')).toHaveLength(4);
    expect(container.querySelector('.history-filters')!.textContent).not.toContain(i18n.t('paymentTerms.heading'));
    await change('payment-history-from', '2026-10-01');
    await change('payment-history-to', '2026-10-29');
    await chooseFilter('payment-history-receiver', 'Synthetic receiver');
    await chooseFilter('payment-history-customer', 'Synthetic customer');
    await flush(310);
    expect(paymentHistoryService.list).toHaveBeenLastCalledWith({
      from: '2026-10-01',
      to: '2026-10-29',
      received_by: receiverId,
      customer_id: customerId,
      page: 1,
      page_size: 50,
    });
    await click(button('common.reset'));
    await flush(310);
    expect(paymentHistoryService.list).toHaveBeenLastCalledWith({ page: 1, page_size: 50 });
    expect(container.textContent).not.toContain('paymentHistory.');
  });
  it('opens details without printing and reuses the customer receipt for the print action', async () => {
    await render(locale);
    await click(button('sales.printReceipt'));
    expect(window.open).toHaveBeenCalledWith(
      `/catalog/customers/${customerId}/payments/${active.id}/receipt`,
      '_blank',
      'noopener,noreferrer'
    );
    const link = Array.from(container.querySelectorAll('a')).find(
      (element) => element.textContent === i18n.t('paymentHistory.viewPayment')
    )!;
    await click(link);
    await flush(300);
    expect(paymentHistoryService.get).toHaveBeenCalledWith(active.id);
    expect(container.textContent).toContain('REC-SYNTHETIC');
    expect(window.print).not.toHaveBeenCalled();
  });
  it('confirms cancellation, submits the reason and refreshes the affected balance and history queries', async () => {
    const invalidation = vi.spyOn(client, 'invalidateQueries');
    await render(locale);
    expect(
      Array.from(container.querySelectorAll('button')).filter(
        (element) => element.textContent === i18n.t('paymentHistory.cancelPayment')
      )
    ).toHaveLength(1);
    await click(button('paymentHistory.cancelPayment'));
    expect(paymentHistoryService.cancel).not.toHaveBeenCalled();
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Synthetic customer');
    await change('payment-cancellation-reason', 'Synthetic correction');
    vi.mocked(paymentHistoryService.list).mockResolvedValue(
      result([{ ...active, cancelled_at: cancelled.cancelled_at }, cancelled])
    );
    await click(button('paymentHistory.cancelPayment', dialog));
    expect(paymentHistoryService.cancel).toHaveBeenCalledWith(active.id, 'Synthetic correction');
    expect(showToast).toHaveBeenCalledWith(i18n.t('paymentHistory.cancelSuccess'), 'success');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(invalidation).toHaveBeenCalledWith({ queryKey: ['customer', customerId] });
    expect(invalidation).toHaveBeenCalledWith({ queryKey: ['payment-history-report', customerId] });
    expect(button('paymentHistory.cancelPayment')).toBeUndefined();
  });
  it('marks cancelled payment details and printed receipts in both languages', async () => {
    vi.mocked(paymentHistoryService.get).mockResolvedValue(receipt(cancelled));
    await render(locale, `/payments/${cancelled.id}`);
    expect(container.querySelector('[role="alert"]')!.textContent).toContain(i18n.t('paymentHistory.cancelledNotice'));
    expect(container.textContent).toContain('Synthetic correction');
    await click(button('common.print'));
    expect(window.print).toHaveBeenCalledOnce();
  });
  it('identifies reconciliation separately from payments without inventing historical receipt balances', async () => {
    const legacy = receipt({ ...active, source: 'legacy', method: 'legacy' });
    vi.mocked(paymentHistoryService.get).mockResolvedValue({
      ...legacy,
      balances: {
        ...legacy.balances,
        previous_balance: null,
        new_balance: null,
        historical_balance_unavailable: true,
        legacy_balance: {
          source_field: 'CLIENTES.DBF.DEBITO',
          source_balance: 500,
          reconstructed_balance: 23293,
          adjustment: -22793,
          source_sha256: 'a'.repeat(64),
          import_session_id: 'synthetic',
          reconciled_at: '2026-10-29T12:00:00Z',
        },
      },
    });
    await render(locale, `/payments/${active.id}`);
    expect(container.textContent).toContain(i18n.t('customers.legacySourceBalance'));
    expect(container.textContent).toContain(i18n.t('customers.legacyBalanceAdjustment'));
    expect(container.textContent).toContain(i18n.t('customers.legacyBalanceHint'));
    expect(container.textContent).toContain(i18n.t('customers.legacyHistoricalBalanceUnavailable'));
  });
  it('handles loading failures, empty results and invalid date ranges', async () => {
    vi.mocked(paymentHistoryService.list).mockRejectedValueOnce(new Error('Synthetic offline'));
    await render(locale);
    expect(container.textContent).toContain(i18n.t('paymentHistory.loadError'));
    vi.mocked(paymentHistoryService.list).mockResolvedValue(result([]));
    await click(button('paymentHistory.retry'));
    expect(container.textContent).toContain(i18n.t('common.empty'));
    await change('payment-history-from', '2026-10-29');
    await change('payment-history-to', '2026-10-01');
    const requests = vi.mocked(paymentHistoryService.list).mock.calls.length;
    await flush(310);
    expect(container.textContent).toContain(i18n.t('paymentHistory.invalidDates'));
    expect(paymentHistoryService.list).toHaveBeenCalledTimes(requests);
  });
});

it.each(['admin', 'manager', 'seller', 'custom'])(
  'restricts cancellation controls by the %s profile even with wildcard permission',
  async (role) => {
    useAuthStore.setState({ user: { ...useAuthStore.getState().user!, role } });
    await render();
    expect(Boolean(button('paymentHistory.cancelPayment'))).toBe(['admin', 'manager'].includes(role));
  }
);
it('shows cancellation failures without closing confirmation or reporting success', async () => {
  vi.mocked(paymentHistoryService.cancel).mockRejectedValue(new Error('Synthetic failure'));
  await render();
  await click(button('paymentHistory.cancelPayment'));
  await click(button('paymentHistory.cancelPayment', document.querySelector('[role="dialog"]')!));
  expect(showToast).toHaveBeenCalledWith(i18n.t('paymentHistory.cancelError'), 'error');
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
});
it('paginates and returns to the first page when a filter changes', async () => {
  vi.mocked(paymentHistoryService.list)
    .mockResolvedValueOnce(result([active], 1, 2))
    .mockResolvedValue(result([cancelled], 2, 2));
  await render();
  await click(button('paymentHistory.next'));
  await flush(310);
  expect(paymentHistoryService.list).toHaveBeenLastCalledWith({ page: 2, page_size: 50 });
  await chooseFilter('payment-history-customer', 'Synthetic customer');
  await flush(310);
  expect(paymentHistoryService.list).toHaveBeenLastCalledWith({ customer_id: customerId, page: 1, page_size: 50 });
});
it('does not read private payments without catalog permission', async () => {
  useAuthStore.setState({ user: { ...useAuthStore.getState().user!, permissions: [] } });
  await render();
  expect(container.textContent).toContain(i18n.t('common.noPermission'));
  expect(paymentHistoryService.list).not.toHaveBeenCalled();
});
it('keeps automatic printing for existing customer receipt links', async () => {
  vi.spyOn(customersService, 'getPaymentReceipt').mockResolvedValue(receipt());
  await render('en', `/catalog/customers/${customerId}/payments/${active.id}/receipt`);
  await flush(250);
  expect(window.print).toHaveBeenCalledOnce();
});
it('defines both locale dictionaries and translates cancellation API errors', async () => {
  expect(Object.keys(resources.en.translation.paymentHistory).sort()).toEqual(
    Object.keys(resources['pt-BR'].translation.paymentHistory).sort()
  );
  for (const locale of ['pt-BR', 'en']) {
    await i18n.changeLanguage(locale);
    expect(parseApiErrorMessage('', { message: 'payment_already_cancelled' })).toBe(
      i18n.t('paymentHistory.alreadyCancelled')
    );
  }
});
