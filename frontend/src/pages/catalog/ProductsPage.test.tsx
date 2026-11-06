// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductsPage } from './ProductsPage';
import { productsService } from '../../services/catalog';
import { mockListPages } from '../../test/page-fixtures';
import { useHasPermission } from '../../store/auth';
import type { Product } from '../../types/catalog';
import i18n from '../../lib/i18n';

vi.mock('../../components/ui/ToastProvider', () => ({
  useToast: () => ({ show: vi.fn() }),
}));
vi.mock('../../store/auth', () => ({
  useHasPermission: vi.fn(() => true),
  useAuthStore: { getState: () => ({ logout: vi.fn() }) },
}));

const product: Product = {
  id: 'fb9fc02f-58a5-4e2c-b03f-632f84068871',
  name: 'Synthetic stock product',
  legacy_code: '1',
  barcode: null,
  group_id: null,
  reference: null,
  min_stock: 5,
  price_cash: 10,
  price_base: 12,
  current_stock: 1234.567,
};
let host: HTMLDivElement, root: Root, client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.mocked(useHasPermission).mockReturnValue(true);
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
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
  }
}
async function render() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <ProductsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  await flush();
}
function stockCell() {
  const index = Array.from(host.querySelectorAll('thead th')).findIndex(
    (header) => header.textContent === i18n.t('products.currentStock'),
  );
  expect(index).toBeGreaterThanOrEqual(0);
  return host.querySelector('tbody tr')!.children[index];
}

async function fill(id: string, value: string) {
  const input = document.getElementById(id) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submit() {
  await act(async () =>
    document
      .querySelector<HTMLFormElement>('[role="dialog"] form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  await flush();
}

describe.each([
  ['pt-BR', 'Estoque atual', '1.234,567', '-2,125'],
  ['en', 'Current stock', '1,234.567', '-2.125'],
])('product stock in %s', (locale, label, positive, negative) => {
  beforeEach(async () => {
    await i18n.changeLanguage(locale);
  });

  it.each([
    [1234.567, positive],
    [0, '0'],
    [-2.125, negative],
  ])(
    'shows %s in the list and existing modal without changing the save payload',
    async (quantity, formatted) => {
      const record = { ...product, current_stock: Number(quantity) };
      mockListPages(async () => [record]);
      const update = vi.spyOn(productsService, 'update').mockResolvedValue(record);
      await render();
      expect(stockCell().textContent).toBe(formatted);
      expect(host.querySelector('thead')?.textContent).toContain(label);
      await act(async () => host.querySelector<HTMLButtonElement>('tbody button')!.click());
      const dialog = document.querySelector('[role="dialog"]')!;
      const stock = dialog.querySelector<HTMLInputElement>('#current_stock')!;
      expect(dialog.querySelector('label[for="current_stock"]')?.textContent).toBe(label);
      expect(stock.value).toBe(formatted);
      expect(stock.readOnly).toBe(true);
      expect(dialog.querySelector<HTMLInputElement>('#min_stock')!.value).toBe('5');
      await act(async () =>
        dialog
          .querySelector<HTMLFormElement>('form')!
          .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
      );
      await flush();
      expect(update).toHaveBeenCalledWith(product.id, {
        name: product.name,
        barcode: null,
        group_id: null,
        reference: null,
        min_stock: 5,
        price_cash: 10,
        price_base: 12,
      });
    },
  );

  it('shows stock to catalog readers and retains write permissions', async () => {
    vi.mocked(useHasPermission).mockImplementation((permission) => permission === 'catalog:read');
    mockListPages(async () => [product]);
    await render();
    expect(stockCell().textContent).toBe(positive);
    expect(host.querySelector<HTMLButtonElement>('tbody button')!.disabled).toBe(true);
  });

  it.each(['default', 'blank', 'fractional'])(
    'creates a product with %s initial stock and shows the saved balance',
    async (mode) => {
      const records: Product[] = [];
      const expected = mode === 'fractional' ? 1234.567 : 0;
      mockListPages(async () => [...records]);
      const create = vi.spyOn(productsService, 'create').mockImplementation(async (payload) => {
        const created = {
          ...product,
          name: payload.name,
          current_stock: payload.initial_stock ?? 0,
        };
        records.push(created);
        return created;
      });
      await render();
      await act(async () => host.querySelector<HTMLButtonElement>('.toolbar button')!.click());
      const stock = document.getElementById('current_stock') as HTMLInputElement;
      expect(stock.value).toBe('0');
      expect(stock.readOnly).toBe(false);
      expect(document.querySelector('label[for="current_stock"]')?.textContent).toBe(label);
      expect(document.querySelector('#current_stock-hint')?.textContent).toBe(
        i18n.t('products.initialStockHint'),
      );
      await fill('name', 'New product with stock');
      if (mode === 'blank') await fill('current_stock', '');
      if (mode === 'fractional') await fill('current_stock', positive);
      await submit();
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New product with stock', initial_stock: expected }),
      );
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(stockCell().textContent).toBe(mode === 'fractional' ? positive : '0');
      await act(async () => host.querySelector<HTMLButtonElement>('.toolbar button')!.click());
      expect((document.getElementById('current_stock') as HTMLInputElement).value).toBe('0');
    },
  );

  it.each(['-1', '0.0001', 'abc'])(
    'rejects %s initial stock with translated feedback',
    async (quantity) => {
      mockListPages(async () => []);
      const create = vi.spyOn(productsService, 'create');
      await render();
      await act(async () => host.querySelector<HTMLButtonElement>('.toolbar button')!.click());
      await fill('name', 'Invalid initial stock');
      await fill('current_stock', quantity);
      await submit();
      expect(document.querySelector('#current_stock-error')?.textContent).toBe(
        i18n.t('products.invalidInitialStock'),
      );
      expect(document.getElementById('current_stock')?.getAttribute('aria-invalid')).toBe('true');
      expect(create).not.toHaveBeenCalled();
    },
  );

  it('retains the entered stock after a failed save for retry', async () => {
    mockListPages(async () => []);
    const create = vi
      .spyOn(productsService, 'create')
      .mockRejectedValue(new Error('Synthetic save failure'));
    await render();
    await act(async () => host.querySelector<HTMLButtonElement>('.toolbar button')!.click());
    await fill('name', 'Retry initial stock');
    await fill('current_stock', '5');
    await submit();
    expect(create).toHaveBeenCalledOnce();
    expect((document.getElementById('current_stock') as HTMLInputElement).value).toBe('5');
  });

  it.each(['loading', 'empty', 'error'])('spans every column in the %s state', async (state) => {
    mockListPages(async () => {
      if (state === 'loading') return new Promise<never>(() => {});
      if (state === 'error') throw new Error('Synthetic product failure');
      return [];
    });
    await render();
    expect(host.querySelector<HTMLTableCellElement>('tbody td')!.colSpan).toBe(
      host.querySelectorAll('thead th').length,
    );
    expect(host.querySelector('.empty-state')?.textContent).toBe(
      state === 'error' ? 'Synthetic product failure' : i18n.t(`common.${state}`),
    );
  });
});
