import { describe, expect, it } from 'vitest';
import { buildSaleStockMovements } from './sales-domain.js';

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
