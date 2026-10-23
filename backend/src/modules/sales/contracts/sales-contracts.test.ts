import { describe, expect, it } from 'vitest';
import { createSaleSchema } from './sales-contracts.js';

describe('createSaleSchema', () => {
  it('accepts null and blank optional text fields in checkout payloads', () => {
    const parsed = createSaleSchema.parse({
      payment_method: 'cash',
      amount_paid: 100,
      order_number: null,
      source: '   ',
      source_key: null,
      items: [
        {
          product_id: '11111111-1111-1111-1111-111111111111',
          quantity: 1,
          unit_price: 100,
        },
      ],
    });

    expect(parsed.order_number).toBeUndefined();
    expect(parsed.source).toBeUndefined();
    expect(parsed.source_key).toBeUndefined();
  });

  it('accepts the new on-credit payment methods', () => {
    const parsed = createSaleSchema.parse({
      payment_method: 'credit_with_entry',
      amount_paid: 100,
      items: [
        {
          product_id: '11111111-1111-1111-1111-111111111111',
          quantity: 1,
        },
      ],
    });

    expect(parsed.payment_method).toBe('credit_with_entry');
  });

  it('allows checkout items without client-side price fields', () => {
    const parsed = createSaleSchema.parse({
      payment_method: 'cash',
      amount_paid: 200,
      items: [
        {
          product_id: '11111111-1111-1111-1111-111111111111',
          quantity: 2,
        },
      ],
    });

    expect(parsed.items[0]?.unit_price).toBeUndefined();
  });
});
