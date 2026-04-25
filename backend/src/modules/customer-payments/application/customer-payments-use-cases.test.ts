import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../db.js', () => ({
  withTransaction: async (fn: (client: unknown) => Promise<unknown>) => fn(undefined),
}));

import { createRegisterCustomerPaymentUseCase } from './customer-payments-use-cases.js';

describe('register customer payment use-case', () => {
  it('rejects payment above open balance', async () => {
    const repository = {
      customerExists: vi.fn().mockResolvedValue(true),
      getCustomerById: vi.fn(),
      getCustomerFinancialTotals: vi.fn().mockResolvedValue({ totalCharges: 100, totalPaid: 60 }),
      listPayments: vi.fn(),
      getFilteredAggregation: vi.fn(),
      insertPayment: vi.fn(),
      getPaymentById: vi.fn(),
      getPaidBefore: vi.fn(),
    };

    const useCase = createRegisterCustomerPaymentUseCase(repository);

    await expect(
      useCase({
        customerId: 'customer-1',
        payload: {
          amount: 50,
          method: 'cash',
          payment_date: new Date('2026-01-01'),
        },
        currentUser: {
          id: 'user-1',
          fullName: 'Staff',
        },
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      message: 'payment exceeds open balance',
    });
  });

  it('registers payment and returns receipt hint', async () => {
    const repository = {
      customerExists: vi.fn().mockResolvedValue(true),
      getCustomerById: vi.fn(),
      getCustomerFinancialTotals: vi.fn().mockResolvedValue({ totalCharges: 300, totalPaid: 50 }),
      listPayments: vi.fn(),
      getFilteredAggregation: vi.fn(),
      insertPayment: vi.fn().mockResolvedValue({
        id: '12345678-1234-1234-1234-123456789012',
        amount: '100',
        payment_date: '2026-01-02',
        method: 'cash',
        reference: null,
        notes: null,
        received_by: 'user-1',
        created_at: '2026-01-02T10:00:00.000Z',
      }),
      getPaymentById: vi.fn(),
      getPaidBefore: vi.fn(),
    };

    const useCase = createRegisterCustomerPaymentUseCase(repository);

    const result = await useCase({
      customerId: 'customer-1',
      payload: {
        amount: 100,
        method: 'cash',
        payment_date: new Date('2026-01-02'),
      },
      currentUser: {
        id: 'user-1',
        fullName: 'Staff',
      },
    });

    expect(result.payment.amount).toBe(100);
    expect(result.summary.previous_balance).toBe(250);
    expect(result.summary.new_balance).toBe(150);
    expect(result.receipt_hint).toBe('REC-12345678');
  });
});
