// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StockAdjustmentDialog } from './StockAdjustmentDialog';
import { productsService } from '../../../services/catalog';
import { useCanAdjustStock } from '../../../store/auth';
import { ApiError } from '../../../api';
import type { Product } from '../../../types/catalog';
import i18n from '../../../lib/i18n';

vi.mock('../../../store/auth', () => ({
  useCanAdjustStock: vi.fn(() => true),
  useAuthStore: { getState: () => ({ logout: vi.fn() }) },
}));
const product: Product = {
  id: 'dd412510-acf1-4113-8c6a-f315ae9bdf44',
  legacy_code: '1',
  name: 'Synthetic item',
  barcode: null,
  group_id: null,
  reference: null,
  min_stock: 0,
  price_cash: 10,
  price_base: 10,
  current_stock: 5,
  stock_version: '1',
};
let host: HTMLDivElement, root: Root, client: QueryClient;
const close = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(useCanAdjustStock).mockReturnValue(true);
  close.mockClear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(productsService, 'get').mockResolvedValue({
    ...product,
    current_stock: 20,
    stock_version: '7',
  });
  vi.spyOn(productsService, 'adjustStock').mockResolvedValue({
    id: 'event',
    product_id: product.id,
    previous_quantity: 20,
    new_quantity: 25,
    difference: 5,
    stock_version: '8',
  });
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
  for (let i = 0; i < 3; i++)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
}
async function render() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <StockAdjustmentDialog product={product} onClose={close} />
      </QueryClientProvider>,
    ),
  );
  await flush();
}
async function fill(id: string, value: string) {
  const node = document.getElementById(id)!;
  await act(async () => {
    const proto =
      node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function review() {
  await act(async () =>
    document
      .querySelector<HTMLFormElement>('[role=dialog] form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  await flush();
}
async function confirm() {
  const dialogs = document.querySelectorAll('[role=dialog]');
  const button = Array.from(
    dialogs[dialogs.length - 1].querySelectorAll<HTMLButtonElement>('button'),
  ).find((b) => b.textContent === i18n.t('stockAdjustment.confirm'))!;
  await act(async () => button.click());
  await flush();
}

describe.each(['pt-BR', 'en'])('manual stock dialog in %s', (locale) => {
  beforeEach(async () => {
    await i18n.changeLanguage(locale);
  });
  it('loads current stock, calculates the difference and requires explicit confirmation', async () => {
    await render();
    expect((document.getElementById('adjust-stock-current') as HTMLInputElement).value).toBe('20');
    expect((document.getElementById('adjust-stock-current') as HTMLInputElement).readOnly).toBe(
      true,
    );
    await fill('adjust-stock-new', '25');
    await fill('adjust-stock-reason', '  Physical count  ');
    expect(document.getElementById('adjust-stock-difference')?.textContent).toBe('5');
    await review();
    expect(document.querySelectorAll('[role=dialog]')).toHaveLength(2);
    expect(productsService.adjustStock).not.toHaveBeenCalled();
    await confirm();
    expect(productsService.adjustStock).toHaveBeenCalledWith(product.id, {
      request_id: expect.any(String),
      expected_version: '7',
      new_quantity: 25,
      reason: 'Physical count',
    });
    expect(close).toHaveBeenCalledOnce();
  });
  it('refreshes a cached stock snapshot even when the application cache is still fresh', async () => {
    client.setQueryDefaults(['stock-adjustment-product'], { staleTime: 30000 });
    client.setQueryData(['stock-adjustment-product', product.id], product);
    await render();
    expect(productsService.get).toHaveBeenCalledOnce();
    expect((document.getElementById('adjust-stock-current') as HTMLInputElement).value).toBe('20');
  });
  it.each(['-1', '1.5', 'abc', '100000000000'])(
    'rejects invalid whole stock %s',
    async (amount) => {
      await render();
      await fill('adjust-stock-new', amount);
      await fill('adjust-stock-reason', 'Count');
      await review();
      expect(document.body.textContent).toContain(i18n.t('stockAdjustment.invalidQuantity'));
      expect(productsService.adjustStock).not.toHaveBeenCalled();
    },
  );
  it('requires a reason and rejects unchanged quantities', async () => {
    await render();
    await fill('adjust-stock-new', '25');
    await review();
    expect(document.body.textContent).toContain(i18n.t('stockAdjustment.reasonRequired'));
    await fill('adjust-stock-reason', 'Count');
    await fill('adjust-stock-new', '20');
    await review();
    expect(document.body.textContent).toContain(i18n.t('stockAdjustment.noChange'));
    expect(productsService.adjustStock).not.toHaveBeenCalled();
  });
  it('cancels confirmation without sending an adjustment', async () => {
    await render();
    await fill('adjust-stock-new', '25');
    await fill('adjust-stock-reason', 'Count');
    await review();
    const dialogs = document.querySelectorAll('[role=dialog]');
    const cancel = Array.from(dialogs[1].querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent === i18n.t('common.cancel'),
    )!;
    await act(async () => cancel.click());
    expect(document.querySelectorAll('[role=dialog]')).toHaveLength(1);
    expect(productsService.adjustStock).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
  it('requires refreshing and reviewing again after a concurrency conflict', async () => {
    vi.mocked(productsService.adjustStock).mockRejectedValueOnce(
      new ApiError(409, i18n.t('stockAdjustment.conflict')),
    );
    await render();
    await fill('adjust-stock-new', '25');
    await fill('adjust-stock-reason', 'Count');
    await review();
    await confirm();
    expect(document.body.textContent).toContain(i18n.t('stockAdjustment.conflict'));
    expect(document.querySelectorAll('[role=dialog]')).toHaveLength(1);
    vi.mocked(productsService.get).mockResolvedValue({
      ...product,
      current_stock: 24,
      stock_version: '8',
    });
    const refresh = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent === i18n.t('stockAdjustment.refresh'),
    )!;
    await act(async () => refresh.click());
    await flush();
    expect(document.getElementById('adjust-stock-difference')?.textContent).toBe('1');
    await review();
    await confirm();
    expect(productsService.adjustStock).toHaveBeenLastCalledWith(
      product.id,
      expect.objectContaining({ expected_version: '8', new_quantity: 25 }),
    );
    const requests = vi.mocked(productsService.adjustStock).mock.calls;
    expect(requests[0][1].request_id).not.toBe(requests[1][1].request_id);
  });
  it('retries an uncertain response with the same request id', async () => {
    vi.mocked(productsService.adjustStock).mockRejectedValueOnce(
      new Error('Synthetic network loss'),
    );
    await render();
    await fill('adjust-stock-new', '25');
    await fill('adjust-stock-reason', 'Count');
    await review();
    await confirm();
    await confirm();
    const requests = vi.mocked(productsService.adjustStock).mock.calls;
    expect(requests).toHaveLength(2);
    expect(requests[0][1]).toEqual(requests[1][1]);
  });
  it('does not render or fetch stock for unauthorized users', async () => {
    vi.mocked(useCanAdjustStock).mockReturnValue(false);
    await render();
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(productsService.get).not.toHaveBeenCalled();
  });
});
