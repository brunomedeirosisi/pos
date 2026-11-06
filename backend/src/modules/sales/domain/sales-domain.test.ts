import { describe, expect, it } from 'vitest';
import { buildSaleStockMovements, resolveCatalogUnitPrice } from './sales-domain.js';

describe('catalog checkout prices', () => {
  const product = {
    id: 'synthetic',
    name: 'Synthetic',
    price_cash: '100.00',
    price_base: '125.00',
  };

  it.each(['cash', 'card', 'bank', 'other', 'credit', 'credit_with_entry', null] as const)(
    'uses the catalog price selected by %s',
    (method) => {
      expect(resolveCatalogUnitPrice(product, method)).toBe(method === 'cash' ? 100 : 125);
    },
  );

  it.each(['cash', 'card', 'bank', 'other', 'credit', 'credit_with_entry'] as const)(
    'uses the other configured price when the preferred price for %s is missing',
    (method) => {
      expect(resolveCatalogUnitPrice({ ...product, price_cash: null }, method)).toBe(125);
      expect(resolveCatalogUnitPrice({ ...product, price_base: null }, method)).toBe(100);
    },
  );

  it('preserves a configured zero instead of falling back', () => {
    expect(resolveCatalogUnitPrice({ ...product, price_cash: 0 }, 'cash')).toBe(0);
    expect(resolveCatalogUnitPrice({ ...product, price_base: 0 }, 'card')).toBe(0);
  });

  it.each(['cash', 'card'] as const)('rejects a product without either price for %s', (method) => {
    expect(() =>
      resolveCatalogUnitPrice({ ...product, price_cash: null, price_base: null }, method),
    ).toThrow('product price is not configured for checkout');
  });
});

describe('buildSaleStockMovements', () => {
  it('aggregates repeated products into one stock movement', () => {
    const movements = buildSaleStockMovements([
      {
        product_id: 'product-1',
        quantity: 1,
        unit_price: 100,
        total: 100,
      },
      {
        product_id: 'product-1',
        quantity: 2,
        unit_price: 100,
        total: 200,
      },
      {
        product_id: 'product-2',
        quantity: 0.5,
        unit_price: 40,
        total: 20,
      },
    ]);

    expect(movements).toEqual([
      {
        product_id: 'product-1',
        quantity: 3,
        unit_value: 100,
        total: 300,
      },
      {
        product_id: 'product-2',
        quantity: 0.5,
        unit_value: 40,
        total: 20,
      },
    ]);
  });

  it('derives movement total from quantity and unit price when total is omitted', () => {
    const [movement] = buildSaleStockMovements([
      {
        product_id: 'product-1',
        quantity: 2.345,
        unit_price: 12.5,
      },
    ]);

    expect(movement).toEqual({
      product_id: 'product-1',
      quantity: 2.345,
      unit_value: 12.5,
      total: 29.31,
    });
  });
});
