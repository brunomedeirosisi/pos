// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductStockHistory } from './ProductStockHistory';
import { mockListPages, pageFixture } from '../../../test/page-fixtures';
import type { Product } from '../../../types/catalog';
import i18n from '../../../lib/i18n';
const product = { id: 'dcd904ea-89dc-44be-b7bd-219e0c7e244b', name: 'Current product' } as Product;
const entry = {
  id: 'event',
  created_at: '2026-11-07T15:30:00Z',
  product_id: product.id,
  product_code: '001',
  product_name: 'Snapshot product',
  user_id: 'c19a4b84-167f-4cac-94a5-b7f60c50d5af',
  user_name: 'Snapshot manager',
  role: 'manager',
  previous_quantity: 2.125,
  new_quantity: 8,
  difference: 5.875,
  reason: 'Physical count',
  movement_type: 'increase',
};
let host: HTMLDivElement, root: Root, client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(400);
  });
  for (let i = 0; i < 3; i++)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
}
async function render() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <ProductStockHistory product={product} />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
async function fill(id: string, value: string) {
  const input = document.getElementById(id)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await flush();
}
describe.each(['pt-BR', 'en'])('stock history in %s', (locale) => {
  beforeEach(async () => {
    await i18n.changeLanguage(locale);
  });
  it('shows persistent snapshots, supports filters and resets pagination', async () => {
    const requests = mockListPages(async (resource, input) =>
      resource === 'stock-adjustments'
        ? pageFixture([entry], Number(input.page), Number(input.pageSize), 50)
        : resource === 'stock-adjustment-users'
          ? [{ id: entry.user_id, name: 'Snapshot manager' }]
          : [
              { id: product.id, name: product.name },
              { id: 'other', name: 'Other product' },
            ],
    );
    await render();
    expect(host.textContent).toContain(i18n.t('stockAdjustment.history'));
    expect(host.textContent).toContain('Snapshot product');
    expect(host.textContent).toContain('Snapshot manager');
    expect(host.textContent).toContain('07/11/2026');
    expect(host.textContent).toContain(locale === 'pt-BR' ? '2,125' : '2.125');
    const next = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${i18n.t('pagination.next')}"]`,
    )!;
    await act(async () => next.click());
    await flush();
    expect(requests).toHaveBeenCalledWith(
      'stock-adjustments',
      expect.objectContaining({ page: 2 }),
    );
    const type = document.getElementById('stock-history-type') as HTMLSelectElement;
    await act(async () => {
      type.value = 'increase';
      type.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    await fill('stock-history-from', '07/11/2026');
    await fill('stock-history-to', '08/11/2026');
    await fill('stock-history-user', 'Snapshot');
    const option = Array.from(document.querySelectorAll<HTMLElement>('[role=option]')).find((n) =>
      n.textContent?.includes('Snapshot manager'),
    )!;
    await act(async () => option.click());
    await flush();
    expect(requests).toHaveBeenCalledWith(
      'stock-adjustments',
      expect.objectContaining({
        product_id: product.id,
        user_id: entry.user_id,
        from: '2026-11-07',
        to: '2026-11-08',
        movement_type: 'increase',
        page: 1,
      }),
    );
    await fill('stock-history-product', 'Other');
    const other = Array.from(document.querySelectorAll<HTMLElement>('[role=option]')).find((n) =>
      n.textContent?.includes('Other product'),
    )!;
    await act(async () => other.click());
    await flush();
    expect(requests).toHaveBeenCalledWith(
      'stock-adjustments',
      expect.objectContaining({ product_id: 'other' }),
    );
    const reset = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent === i18n.t('common.reset'),
    )!;
    await act(async () => reset.click());
    await flush();
    expect(requests).toHaveBeenCalledWith(
      'stock-adjustments',
      expect.objectContaining({
        product_id: product.id,
        user_id: '',
        from: '',
        to: '',
        movement_type: '',
        page: 1,
      }),
    );
  });
  it('shows translated errors and rejects reversed date periods', async () => {
    mockListPages(async (resource) => {
      if (resource === 'stock-adjustments') throw Error('Synthetic history failure');
      return [];
    });
    await render();
    expect(host.textContent).toContain(i18n.t('stockAdjustment.historyError'));
    await fill('stock-history-from', '08/11/2026');
    await fill('stock-history-to', '07/11/2026');
    expect(host.textContent).toContain(i18n.t('stockAdjustment.invalidDates'));
  });
});
