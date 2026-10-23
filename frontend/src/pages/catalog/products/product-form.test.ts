import { describe, expect, it } from 'vitest';
import { buildProductPayload } from './product-form';

describe('buildProductPayload', () => {
  it('does not include a manually editable code field', () => {
    const payload = buildProductPayload({
      name: 'Produto novo',
      barcode: ' 123 ',
      group_id: '',
      reference: ' Ref ',
      min_stock: 1,
      price_cash: 10,
      price_base: 12,
    });

    expect(payload).toEqual({
      name: 'Produto novo',
      barcode: '123',
      group_id: null,
      reference: 'Ref',
      min_stock: 1,
      price_cash: 10,
      price_base: 12,
    });
    expect('legacy_code' in payload).toBe(false);
  });
});
