import { describe, expect, it } from 'vitest';
import { buildProductPayload, buildProductCreatePayload, productFormSchema } from './product-form';

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

describe('initial product stock', () => {
  it.each([
    ['1.234,567', 1234.567],
    ['1,234.567', 1234.567],
    ['0', 0],
    ['', 0],
    [null, 0],
    [undefined, 0],
    [99999999999.999, 99999999999.999],
  ])('parses %s for creation and excludes stock from updates', (input, expected) => {
    const values = productFormSchema.parse({ name: 'New product', initial_stock: input });
    expect(buildProductCreatePayload(values).initial_stock).toBe(expected);
    expect(buildProductPayload(values)).not.toHaveProperty('initial_stock');
    expect(buildProductPayload(values)).not.toHaveProperty('current_stock');
  });

  it.each(['abc', '12abc', '-1', '0,0001', '100000000000', Infinity, NaN])(
    'rejects invalid initial stock %s',
    (initial_stock) => {
      expect(productFormSchema.safeParse({ name: 'New product', initial_stock }).success).toBe(
        false,
      );
    },
  );
});
