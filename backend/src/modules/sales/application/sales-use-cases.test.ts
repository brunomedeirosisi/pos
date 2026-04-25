import { describe, expect, it, vi } from 'vitest';
import { createCancelSaleUseCase, createCreateSaleUseCase } from './sales-use-cases.js';

function createRepositoryMock() {
  return {
    list: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    cancel: vi.fn(),
  };
}

describe('sales use-cases', () => {
  it('blocks create when discount exceeds role limit', async () => {
    const repository = createRepositoryMock();
    const useCase = createCreateSaleUseCase(repository);

    await expect(
      useCase(
        {
          items: [{ product_id: '11111111-1111-1111-1111-111111111111', quantity: 1, unit_price: 100, total: 100 }],
          subtotal: 100,
          discount: 80,
          total: 20,
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
    repository.create.mockResolvedValue({
      id: 'sale-1',
      emission_date: '2026-01-01',
      order_number: null,
      seller_id: null,
      customer_id: null,
      payment_term_id: null,
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
        items: [{ product_id: '11111111-1111-1111-1111-111111111111', quantity: 1, unit_price: 100 }],
      },
      {
        permissions: ['*'],
        discountLimit: 0,
      }
    );

    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('sale-1');
    expect(result.total).toBe(100);
    expect(result.items).toHaveLength(1);
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
});