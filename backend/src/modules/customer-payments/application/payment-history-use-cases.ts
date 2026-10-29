import { withTransaction } from '../../../db.js';
import { customerBalance } from '../domain/customer-balance.js';
import { conflict, forbidden, notFound } from '../../../errors.js';
import { resolvePagination } from '../../../utils/pagination.js';
import { logAudit } from '../../../utils/audit.js';
import type { PaymentHistoryQuery, PaymentHistoryResponse } from '../contracts/payment-history-contracts.js';
import { PgCustomerPaymentsRepository } from '../repository/customer-payments-repository.js';
import { PgPaymentHistoryRepository } from '../repository/payment-history-repository.js';
import { mapPaymentRecord } from './customer-payments-use-cases.js';

export function createListPaymentHistoryUseCase(repository: PgPaymentHistoryRepository) {
  return async (filters: PaymentHistoryQuery): Promise<PaymentHistoryResponse> => {
    const pagination = resolvePagination(filters, { defaultPageSize: 50, maxPageSize: 200 });
    const result = await repository.list(filters, pagination);
    return {
      payments: result.payments.map((row) => ({
        ...mapPaymentRecord(row),
        customer_id: row.customer_id,
        customer_name: row.customer_name,
      })),
      pagination: {
        page: pagination.page,
        page_size: pagination.pageSize,
        total_items: result.totalItems,
        total_pages: Math.max(1, Math.ceil(result.totalItems / pagination.pageSize)),
      },
    };
  };
}

export function createCancelPaymentUseCase(
  repository: PgPaymentHistoryRepository,
  customers: PgCustomerPaymentsRepository
) {
  return async (input: { id: string; reason?: string; user: { id: string; role: string }; ipAddress?: string }) => {
    // Role restriction is intentional: a custom role with wildcard permissions still cannot cancel payments.
    if (!['admin', 'manager'].includes(input.user.role)) throw forbidden('payment_cancellation_forbidden');
    return withTransaction(async (client) => {
      const payment = await repository.get(input.id, client);
      if (!payment) throw notFound('payment_not_found');
      // Share registration's customer lock to serialize all changes to this balance.
      if (!(await customers.customerExists(payment.customer_id, 'update', client)))
        throw notFound('customer not found');
      if (!(await repository.cancel(input.id, input.user.id, input.reason?.trim() || null, client))) {
        throw conflict('payment_already_cancelled');
      }
      const cancelled = await repository.get(input.id, client);
      const totals = await customers.getCustomerFinancialTotals(payment.customer_id, client);
      await logAudit({
        userId: input.user.id,
        action: 'CUSTOMER_PAYMENT_CANCEL',
        ipAddress: input.ipAddress,
        client,
        details: {
          paymentId: input.id,
          customerId: payment.customer_id,
          amount: String(payment.amount),
          reason: input.reason?.trim() || null,
        },
      });
      return {
        payment: {
          ...mapPaymentRecord(cancelled!),
          customer_id: payment.customer_id,
          customer_name: payment.customer_name,
        },
        current_balance: customerBalance(totals),
      };
    });
  };
}
