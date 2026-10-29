// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { SalesListPage } from './SalesListPage';
import { PaymentHistoryPage } from './PaymentHistoryPage';
import { customersService, sellersService, paymentTermsService } from '../services/catalog';
import { salesService } from '../services/sales';
import { paymentHistoryService } from '../services/paymentHistory';
import { useAuthStore } from '../store/auth';
import i18n from '../lib/i18n';

vi.mock('../hooks/useSaleReceiptActions', () => ({
  useSaleReceiptActions: () => ({ isPrinting: false, printReceipt: vi.fn() }),
}));
vi.mock('../components/ui/ToastProvider', () => ({ useToast: () => ({ show: vi.fn() }) }));

const customerId = '0329e239-c0ca-4500-8b08-a8411c044ed8';
const sellerId = '35eebd64-d3fe-451d-973a-cf76e1d790a5';
const termId = '9733a316-8752-4afc-96e3-31c14089dfb5';
const remoteCustomer = {
  id: customerId,
  name: 'Remote customer',
  legacy_code: '9876',
  cpf: null,
  address: null,
  city: null,
  uf: null,
  cep: null,
  phone: null,
  status: 'active' as const,
  credit_limit: null,
  notes: null,
};
let container: HTMLDivElement, root: Root, client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useAuthStore.setState({
    user: {
      id: sellerId,
      fullName: 'Synthetic admin',
      email: 'test@example.test',
      role: 'admin',
      permissions: ['*'],
      discountLimit: 100,
    },
  });
  vi.spyOn(customersService, 'list').mockImplementation(async (search) => (search ? [remoteCustomer] : []));
  vi.spyOn(sellersService, 'list').mockImplementation(async (search) =>
    search ? [{ id: sellerId, name: 'Remote seller', legacy_code: '12' }] : []
  );
  vi.spyOn(paymentTermsService, 'list').mockImplementation(async (search) =>
    search ? [{ id: termId, name: 'Remote term', legacy_code: '3' }] : []
  );
  vi.spyOn(salesService, 'list').mockResolvedValue([]);
  vi.spyOn(paymentHistoryService, 'receivers').mockResolvedValue([
    { id: sellerId, full_name: 'Synthetic receiver' },
    { id: termId, full_name: 'Another user' },
  ]);
  vi.spyOn(paymentHistoryService, 'list').mockResolvedValue({
    payments: [],
    pagination: { page: 1, page_size: 50, total_items: 0, total_pages: 1 },
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useAuthStore.setState({ user: null });
});
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10);
  });
}
async function render(view: 'sales' | 'payments', locale: string) {
  await i18n.changeLanguage(locale);
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter>{view === 'sales' ? <SalesListPage /> : <PaymentHistoryPage />}</MemoryRouter>
      </QueryClientProvider>
    )
  );
  await flush();
}
async function type(id: string, text: string) {
  const input = document.getElementById(id)! as HTMLInputElement;
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function enter(id: string) {
  await act(async () =>
    document.getElementById(id)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  );
  await flush(310);
}
async function reset() {
  const button = Array.from(container.querySelectorAll('button')).find(
    (element) => element.textContent === i18n.t('common.reset')
  )!;
  await act(async () => button.click());
  await flush(310);
}

describe.each(['pt-BR', 'en'])('searchable history filters in %s', (locale) => {
  it('searches all three sales catalogs and applies only selected IDs, preserving labels outside the initial page', async () => {
    await render('sales', locale);
    expect(container.querySelectorAll('[role="combobox"]')).toHaveLength(3);
    const before = vi.mocked(salesService.list).mock.calls.length;
    await type('sales-filter-customer', '9876');
    await flush(310);
    expect(customersService.list).toHaveBeenLastCalledWith('9876');
    expect(salesService.list).toHaveBeenCalledTimes(before);
    await enter('sales-filter-customer');
    expect(salesService.list).toHaveBeenLastCalledWith({ customer_id: customerId });
    expect((document.getElementById('sales-filter-customer') as HTMLInputElement).value).toBe('Remote customer');
    await type('sales-filter-seller', '12');
    await flush(310);
    await enter('sales-filter-seller');
    await type('sales-filter-payment-term', '3');
    await flush(310);
    await enter('sales-filter-payment-term');
    expect(sellersService.list).toHaveBeenLastCalledWith('12');
    expect(paymentTermsService.list).toHaveBeenLastCalledWith('3');
    expect(salesService.list).toHaveBeenLastCalledWith({
      customer_id: customerId,
      seller_id: sellerId,
      payment_term_id: termId,
    });
    await type('sales-filter-customer', 'uncommitted draft');
    await reset();
    expect(salesService.list).toHaveBeenLastCalledWith({});
    for (const input of Array.from(container.querySelectorAll<HTMLInputElement>('[role="combobox"]'))) expect(input.value).toBe('');
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });
  it('searches receiving users locally and customers remotely without adding a payment-term filter', async () => {
    await render('payments', locale);
    expect(container.querySelectorAll('[role="combobox"]')).toHaveLength(2);
    expect(container.querySelector('.history-filters')!.textContent).not.toContain(i18n.t('paymentTerms.heading'));
    await type('payment-history-receiver', 'RECEIVER');
    expect(Array.from(container.querySelectorAll('[role="option"]')).map((option) => option.textContent)).toEqual([
      'Synthetic receiver',
    ]);
    await enter('payment-history-receiver');
    expect(paymentHistoryService.receivers).toHaveBeenCalledOnce();
    await type('payment-history-customer', '9876');
    await flush(310);
    expect(customersService.list).toHaveBeenLastCalledWith('9876');
    await enter('payment-history-customer');
    expect(paymentHistoryService.list).toHaveBeenLastCalledWith({
      customer_id: customerId,
      received_by: sellerId,
      page: 1,
      page_size: 50,
    });
    expect((document.getElementById('payment-history-customer') as HTMLInputElement).value).toBe('Remote customer');
    await type('payment-history-customer', 'draft');
    await reset();
    expect(paymentHistoryService.list).toHaveBeenLastCalledWith({ page: 1, page_size: 50 });
    for (const input of Array.from(container.querySelectorAll<HTMLInputElement>('[role="combobox"]'))) expect(input.value).toBe('');
  });
});
