import { describe, expect, it, vi } from 'vitest';
import { conflict } from '../../../errors.js';
import { createCancelSaleUseCase, createCreateSaleUseCase } from './sales-use-cases.js';
import type { CreateSaleInputDto } from '../contracts/sales-contracts.js';

function createRepositoryMock() {
  return {
    list: vi.fn(),
    findProductsForCheckout: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    findReceiptById: vi.fn(),
    cancel: vi.fn(),
  };
}

const catalogProducts = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Produto 1',
    price_cash: 100,
    price_base: 120,
  },
];

describe('sales use-cases', () => {
  it.each([
    { amount_paid: 100 },
    { payment_method: null, amount_paid: 100 },
    { payment_method: 'cash' },
    { payment_method: 'cash', amount_paid: null },
  ])('rejects incomplete payment before reading or writing the repository: %j', async (payment) => {
    const repository = createRepositoryMock();
    const useCase = createCreateSaleUseCase(repository);
    const input = {
      items: [{ product_id: catalogProducts[0].id, quantity: 1 }],
      ...payment,
    } as unknown as CreateSaleInputDto;
    await expect(useCase(input, null)).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.findProductsForCheckout).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('blocks create when discount exceeds role limit', async () => {
    const repository = createRepositoryMock();
    repository.findProductsForCheckout.mockResolvedValue(catalogProducts);
    const useCase = createCreateSaleUseCase(repository);

    await expect(
      useCase(
        {
          items: [{ product_id: '11111111-1111-1111-1111-111111111111', quantity: 1, unit_price: 1, total: 1 }],
          subtotal: 1,
          discount: 20,
          total: 1,
          payment_method: 'cash',
          amount_paid: 100,
        },
      {
        permissions: ['pos:checkout'],
        discountLimit: 10,
      }
      )
    ).rejects.toMatchObject({
      statusCode: 403,
      message: 'discount exceeds allowed limit for role',
    });
  });

  it('creates sale with normalized payload', async () => {
    const repository = createRepositoryMock();
    repository.findProductsForCheckout.mockResolvedValue(catalogProducts);
    repository.create.mockResolvedValue({
      id: 'sale-1',
      emission_date: '2026-01-01',
      paid_at: '2026-01-01T10:00:00.000Z',
      order_number: null,
      seller_id: null,
      customer_id: null,
      payment_term_id: null,
      payment_method: 'cash',
      amount_paid: '100',
      change_amount: '0',
      subtotal: '100',
      discount: '0',
      total: '100',
      status: 'completed',
      source: null,
      source_key: null,
      cancelled_at: null,
      cancellation_reason: null,
      items: [
        {
          id: 'item-1',
          product_id: '11111111-1111-1111-1111-111111111111',
          quantity: '1',
          unit_price: '100',
          total: '100',
        },
      ],
    });

    const useCase = createCreateSaleUseCase(repository);

    const result = await useCase(
      {
        items: [{ product_id: '11111111-1111-1111-1111-111111111111', quantity: 1, unit_price: 999 }],
        payment_method: 'cash',
        amount_paid: 100,
      },
      {
        permissions: ['*'],
        discountLimit: 0,
      }
    );

    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotal: 100,
        total: 100,
        items: [
          expect.objectContaining({
            product_id: '11111111-1111-1111-1111-111111111111',
            unit_price: 100,
            total: 100,
          }),
        ],
      })
    );
    expect(result.id).toBe('sale-1');
    expect(result.total).toBe(100);
    expect(result.items).toHaveLength(1);
  });

  it('ignores client-submitted prices and totals in favor of catalog pricing', async () => {
    const repository = createRepositoryMock();
    repository.findProductsForCheckout.mockResolvedValue(catalogProducts);
    repository.create.mockResolvedValue({
      id: 'sale-catalog',
      emission_date: '2026-01-01',
      paid_at: '2026-01-01T10:00:00.000Z',
      order_number: null,
      seller_id: null,
      customer_id: null,
      payment_term_id: null,
      payment_method: 'cash',
      amount_paid: '100',
      change_amount: '0',
      subtotal: '100',
      discount: '0',
      total: '100',
      status: 'completed',
      source: null,
      source_key: null,
      cancelled_at: null,
      cancellation_reason: null,
      items: [
        {
          id: 'item-1',
          product_id: '11111111-1111-1111-1111-111111111111',
          quantity: '1',
          unit_price: '100',
          total: '100',
        },
      ],
    });

    const useCase = createCreateSaleUseCase(repository);

    await useCase(
      {
        items: [{ product_id: '11111111-1111-1111-1111-111111111111', quantity: 1, unit_price: 0.01, total: 0.01 }],
        subtotal: 0.01,
        total: 0.01,
        payment_method: 'cash',
        amount_paid: 100,
      },
      {
        permissions: ['*'],
        discountLimit: 0,
      }
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotal: 100,
        total: 100,
        items: [
          expect.objectContaining({
            unit_price: 100,
            total: 100,
          }),
        ],
      })
    );
  });

  it('uses base price for non-cash payment methods', async () => {
    const repository = createRepositoryMock();
    repository.findProductsForCheckout.mockResolvedValue(catalogProducts);
    repository.create.mockResolvedValue({
      id: 'sale-card',
      emission_date: '2026-01-01',
      paid_at: '2026-01-01T10:00:00.000Z',
      order_number: null,
      seller_id: null,
      customer_id: null,
      payment_term_id: null,
      payment_method: 'card',
      amount_paid: '120',
      change_amount: '0',
      subtotal: '120',
      discount: '0',
      total: '120',
      status: 'completed',
      source: null,
      source_key: null,
      cancelled_at: null,
      cancellation_reason: null,
      items: [],
    });

    const useCase = createCreateSaleUseCase(repository);

    await useCase(
      {
        items: [{ product_id: '11111111-1111-1111-1111-111111111111', quantity: 1, unit_price: 100 }],
        payment_method: 'card',
        amount_paid: 120,
      },
      {
        permissions: ['*'],
        discountLimit: 0,
      }
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotal: 120,
        total: 120,
        items: [
          expect.objectContaining({
            unit_price: 120,
            total: 120,
          }),
        ],
      })
    );
  });

  it('rejects sale when amount paid is below total', async () => {
    const repository = createRepositoryMock();
    repository.findProductsForCheckout.mockResolvedValue(catalogProducts);
    const useCase = createCreateSaleUseCase(repository);

    await expect(
      useCase(
        {
          items: [{ product_id: '11111111-1111-1111-1111-111111111111', quantity: 1, unit_price: 100 }],
          payment_method: 'cash',
          amount_paid: 50,
        },
        {
          permissions: ['*'],
          discountLimit: 0,
        }
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'amount_paid cannot be lower than sale total',
    });
  });

  it('allows full credit sale without upfront payment', async () => {
    const repository = createRepositoryMock();
    repository.findProductsForCheckout.mockResolvedValue([
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Produto 1',
        price_cash: 200,
        price_base: 250,
      },
    ]);
    repository.create.mockResolvedValue({
      id: 'sale-credit',
      emission_date: '2026-01-01',
      paid_at: '2026-01-01T10:00:00.000Z',
      order_number: null,
      seller_id: null,
      customer_id: '11111111-1111-1111-1111-111111111112',
      payment_term_id: null,
      payment_method: 'credit',
      amount_paid: '0',
      change_amount: '0',
      subtotal: '250',
      discount: '0',
      total: '250',
      pending_amount: '250',
      status: 'completed',
      source: null,
      source_key: null,
      cancelled_at: null,
      cancellation_reason: null,
      items: [],
    });

    const useCase = createCreateSaleUseCase(repository);

    const result = await useCase(
      {
        items: [{ product_id: '11111111-1111-1111-1111-111111111111', quantity: 1, unit_price: 250 }],
        customer_id: '11111111-1111-1111-1111-111111111112',
        payment_method: 'credit',
        amount_paid: 0,
      },
      {
        permissions: ['*'],
        discountLimit: 0,
      }
    );

    expect(result.pending_amount).toBe(250);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amountPaid: 0,
        pendingAmount: 250,
        items: [expect.objectContaining({ unit_price: 250 })],
      })
    );
  });

  it('allows credit sale with down payment', async () => {
    const repository = createRepositoryMock();
    repository.findProductsForCheckout.mockResolvedValue([
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Produto 1',
        price_cash: 200,
        price_base: 250,
      },
    ]);
    repository.create.mockResolvedValue({
      id: 'sale-entry',
      emission_date: '2026-01-01',
      paid_at: '2026-01-01T10:00:00.000Z',
      order_number: null,
      seller_id: null,
      customer_id: '11111111-1111-1111-1111-111111111112',
      payment_term_id: null,
      payment_method: 'credit_with_entry',
      amount_paid: '100',
      change_amount: '0',
      subtotal: '250',
      discount: '0',
      total: '250',
      pending_amount: '150',
      status: 'completed',
      source: null,
      source_key: null,
      cancelled_at: null,
      cancellation_reason: null,
      items: [],
    });

    const useCase = createCreateSaleUseCase(repository);

    const result = await useCase(
      {
        items: [{ product_id: '11111111-1111-1111-1111-111111111111', quantity: 1, unit_price: 250 }],
        customer_id: '11111111-1111-1111-1111-111111111112',
        payment_method: 'credit_with_entry',
        amount_paid: 100,
      },
      {
        permissions: ['*'],
        discountLimit: 0,
      }
    );

    expect(result.pending_amount).toBe(150);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amountPaid: 100,
        pendingAmount: 150,
        items: [expect.objectContaining({ unit_price: 250 })],
      })
    );
  });

  it('rejects credit sale with down payment above total', async () => {
    const repository = createRepositoryMock();
    repository.findProductsForCheckout.mockResolvedValue(catalogProducts);
    const useCase = createCreateSaleUseCase(repository);

    await expect(
      useCase(
        {
          items: [{ product_id: '11111111-1111-1111-1111-111111111111', quantity: 1, unit_price: 100 }],
          payment_method: 'credit_with_entry',
          amount_paid: 150,
        },
        {
          permissions: ['*'],
          discountLimit: 0,
        }
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'amount_paid cannot exceed sale total',
    });
  });

  it('rejects credit sale without customer', async () => {
    const repository = createRepositoryMock();
    repository.findProductsForCheckout.mockResolvedValue(catalogProducts);
    const useCase = createCreateSaleUseCase(repository);

    await expect(
      useCase(
        {
          items: [{ product_id: '11111111-1111-1111-1111-111111111111', quantity: 1, unit_price: 100 }],
          payment_method: 'credit',
          amount_paid: 0,
        },
        {
          permissions: ['*'],
          discountLimit: 0,
        }
      )
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'customer_id is required for credit sales',
    });
  });

  it('returns not found when cancelling unknown sale', async () => {
    const repository = createRepositoryMock();
    repository.cancel.mockResolvedValue(null);

    const useCase = createCancelSaleUseCase(repository);

    await expect(useCase('missing-id', {})).rejects.toMatchObject({
      statusCode: 404,
      message: 'sale not found',
    });
  });

  it('propagates cancellation conflict when the sale would create customer credit', async () => {
    const repository = createRepositoryMock();
    repository.cancel.mockRejectedValue(
      conflict('sale cannot be cancelled because it would create a customer credit. Reverse customer payments or refund amounts first')
    );

    const useCase = createCancelSaleUseCase(repository);

    await expect(useCase('sale-1', {})).rejects.toMatchObject({
      statusCode: 409,
      message:
        'sale cannot be cancelled because it would create a customer credit. Reverse customer payments or refund amounts first',
    });
  });
});
