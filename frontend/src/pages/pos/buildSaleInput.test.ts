import { describe, expect, it } from 'vitest';
import { buildSaleInput } from './buildSaleInput';

describe('buildSaleInput', () => {
  it('omits an empty order number from the checkout payload', () => {
    const payload = buildSaleInput({
      orderNumber: '   ',
      customerId: null,
      sellerId: null,
      paymentTermId: null,
      paymentMethod: 'cash',
      amountPaid: 50,
      changeAmount: 0,
      subtotal: 50,
      discount: 0,
      total: 50,
      pendingAmount: 0,
      items: [
        {
          productId: 'product-1',
          name: 'Produto 1',
          priceCash: 50,
          priceBase: 50,
          unitPrice: 50,
          quantity: 1,
          total: 50,
        },
      ],
    });

    expect(payload.order_number).toBeUndefined();
  });

  it('keeps a filled order number trimmed', () => {
    const payload = buildSaleInput({
      orderNumber: ' PED-123 ',
      customerId: null,
      sellerId: null,
      paymentTermId: null,
      paymentMethod: 'cash',
      amountPaid: 50,
      changeAmount: 0,
      subtotal: 50,
      discount: 0,
      total: 50,
      pendingAmount: 0,
      items: [
        {
          productId: 'product-1',
          name: 'Produto 1',
          priceCash: 50,
          priceBase: 50,
          unitPrice: 50,
          quantity: 1,
          total: 50,
        },
      ],
    });

    expect(payload.order_number).toBe('PED-123');
  });

  it('keeps the actual amount paid for on-credit sales with down payment', () => {
    const payload = buildSaleInput({
      orderNumber: 'PED-123',
      customerId: 'customer-1',
      sellerId: null,
      paymentTermId: null,
      paymentMethod: 'credit_with_entry',
      amountPaid: 100,
      changeAmount: 0,
      subtotal: 250,
      discount: 0,
      total: 250,
      pendingAmount: 150,
      items: [
        {
          productId: 'product-1',
          name: 'Produto 1',
          priceCash: 250,
          priceBase: 250,
          unitPrice: 250,
          quantity: 1,
          total: 250,
        },
      ],
    });

    expect(payload.amount_paid).toBe(100);
  });
});
