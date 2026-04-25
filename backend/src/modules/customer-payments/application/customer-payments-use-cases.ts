import { withTransaction } from '../../../db.js';
import { resolvePagination } from '../../../utils/pagination.js';
import { badRequest, notFound } from '../../../errors.js';
import {
  paymentMethodFilterValues,
  type CustomerPaymentDto,
  type CustomerPaymentHistoryReportDto,
  type CustomerPaymentReceiptDto,
  type ListCustomerPaymentsResponseDto,
  type PaymentInputDto,
  type PaymentListQueryDto,
  type RegisterCustomerPaymentResponseDto,
} from '../contracts/customer-payments-contracts.js';
import { OVERPAY_TOLERANCE, normalizeOptionalText, toDateOnly, toIsoString, toNumber } from '../domain/customer-payments-domain.js';
import type { CustomerPaymentRecord, CustomerPaymentsRepository } from '../repository/customer-payments-repository.js';

type PaymentMethodFilterValue = (typeof paymentMethodFilterValues)[number];

type CompanyInfo = {
  name: string;
  address: string;
  tax_id: string;
};

type CurrentUser = {
  id: string;
  fullName: string;
};

function mapPaymentRecord(row: CustomerPaymentRecord): CustomerPaymentDto {
  return {
    id: row.id,
    amount: toNumber(row.amount),
    payment_date: toDateOnly(row.payment_date),
    method: (row.method as PaymentMethodFilterValue) ?? 'cash',
    reference: row.reference ?? null,
    notes: row.notes ?? null,
    received_by: row.received_by,
    received_by_name: row.received_by_name ?? null,
    source: row.source,
    created_at: toIsoString(row.created_at),
  };
}

function toDate(value: string | Date | null | undefined): Date {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}

export function createListCustomerPaymentsUseCase(repository: CustomerPaymentsRepository) {
  return async (customerId: string, filters: PaymentListQueryDto): Promise<ListCustomerPaymentsResponseDto> => {
    const orderDirection = filters.sort ?? 'desc';
    const pagination = resolvePagination(filters, { defaultPageSize: 100, maxPageSize: 200 });

    return withTransaction(async (client) => {
      const exists = await repository.customerExists(customerId, 'share', client);
      if (!exists) {
        throw notFound('customer not found');
      }

      const totals = await repository.getCustomerFinancialTotals(customerId, client);
      const currentBalance = Number((totals.totalCharges - totals.totalPaid).toFixed(2));

      const pageResult = await repository.listPayments(customerId, filters, orderDirection, {
        limit: pagination.limit,
        offset: pagination.offset,
      }, client);

      const totalPages = pagination.pageSize > 0 ? Math.max(1, Math.ceil(pageResult.filteredCount / pagination.pageSize)) : 1;

      return {
        payments: pageResult.payments.map(mapPaymentRecord),
        summary: {
          total_debt: totals.totalCharges,
          total_paid: totals.totalPaid,
          current_balance: currentBalance,
          filtered_total_paid: pageResult.filteredTotal,
          filtered_count: pageResult.filteredCount,
          applied_filters: {
            start_date: toDateOnly(filters.start_date),
            end_date: toDateOnly(filters.end_date),
            method: (filters.method as PaymentMethodFilterValue) ?? null,
            sort: orderDirection,
          },
        },
        pagination: {
          page: pagination.page,
          page_size: pagination.pageSize,
          total_items: pageResult.filteredCount,
          total_pages: totalPages,
        },
      };
    });
  };
}

export function createCustomerPaymentHistoryReportUseCase(repository: CustomerPaymentsRepository, company: CompanyInfo) {
  return async (customerId: string, filters: PaymentListQueryDto): Promise<CustomerPaymentHistoryReportDto> => {
    const orderDirection = filters.sort ?? 'desc';
    const pagination = resolvePagination(filters, { defaultPageSize: 1000, maxPageSize: 5000 });

    return withTransaction(async (client) => {
      const customer = await repository.getCustomerById(customerId, 'share', client);
      if (!customer) {
        throw notFound('customer not found');
      }

      const totals = await repository.getCustomerFinancialTotals(customerId, client);
      const currentBalance = Number((totals.totalCharges - totals.totalPaid).toFixed(2));
      const pageResult = await repository.listPayments(customerId, filters, orderDirection, {
        limit: pagination.limit,
        offset: pagination.offset,
      }, client);

      return {
        generated_at: new Date().toISOString(),
        company,
        customer,
        payments: pageResult.payments.map(mapPaymentRecord),
        summary: {
          total_debt: totals.totalCharges,
          total_paid: totals.totalPaid,
          current_balance: currentBalance,
          filtered_total_paid: pageResult.filteredTotal,
          filtered_count: pageResult.filteredCount,
          applied_filters: {
            start_date: toDateOnly(filters.start_date),
            end_date: toDateOnly(filters.end_date),
            method: (filters.method as PaymentMethodFilterValue) ?? null,
            sort: orderDirection,
          },
        },
      };
    });
  };
}

export function createCustomerPaymentReceiptUseCase(repository: CustomerPaymentsRepository, company: CompanyInfo) {
  return async (customerId: string, paymentId: string): Promise<CustomerPaymentReceiptDto> => {
    return withTransaction(async (client) => {
      const customer = await repository.getCustomerById(customerId, 'share', client);
      if (!customer) {
        throw notFound('customer not found');
      }

      const paymentRow = await repository.getPaymentById(customerId, paymentId, client);
      if (!paymentRow) {
        throw notFound('payment not found');
      }

      const totals = await repository.getCustomerFinancialTotals(customerId, client);
      const paymentDate = toDate(paymentRow.payment_date);
      const createdAt = toDate(paymentRow.created_at);
      const paidBefore = await repository.getPaidBefore(customerId, paymentRow.id, paymentDate, createdAt, client);
      const paymentAmount = toNumber(paymentRow.amount);
      const previousBalance = Number((totals.totalCharges - paidBefore).toFixed(2));
      const newBalance = Math.max(0, Number((previousBalance - paymentAmount).toFixed(2)));

      return {
        company,
        customer,
        payment: {
          ...mapPaymentRecord(paymentRow),
          code: `REC-${paymentRow.id.slice(0, 8).toUpperCase()}`,
        },
        balances: {
          total_debt: totals.totalCharges,
          total_paid: totals.totalPaid,
          previous_balance: previousBalance,
          payment_amount: paymentAmount,
          new_balance: newBalance,
        },
        generated_at: new Date().toISOString(),
      };
    });
  };
}

export function createRegisterCustomerPaymentUseCase(repository: CustomerPaymentsRepository) {
  return async (
    input: {
      customerId: string;
      payload: PaymentInputDto;
      currentUser: CurrentUser;
    }
  ): Promise<RegisterCustomerPaymentResponseDto> => {
    return withTransaction(async (client) => {
      const exists = await repository.customerExists(input.customerId, 'update', client);
      if (!exists) {
        throw notFound('customer not found');
      }

      const totals = await repository.getCustomerFinancialTotals(input.customerId, client);
      const openBalance = Number((totals.totalCharges - totals.totalPaid).toFixed(2));
      if (openBalance <= 0) {
        throw badRequest('customer has no outstanding balance');
      }

      if (input.payload.amount > openBalance + OVERPAY_TOLERANCE) {
        throw badRequest('payment exceeds open balance');
      }

      const inserted = await repository.insertPayment(
        {
          customerId: input.customerId,
          amount: input.payload.amount,
          paymentDate: input.payload.payment_date ?? new Date(),
          method: input.payload.method ?? 'cash',
          reference: normalizeOptionalText(input.payload.reference),
          notes: normalizeOptionalText(input.payload.notes),
          receivedBy: input.currentUser.id,
        },
        client
      );

      const paymentAmount = toNumber(inserted.amount);
      const totalPaid = Number((totals.totalPaid + paymentAmount).toFixed(2));
      const newBalance = Math.max(0, Number((openBalance - paymentAmount).toFixed(2)));

      const payment: CustomerPaymentDto = {
        id: inserted.id,
        amount: paymentAmount,
        payment_date: toDateOnly(inserted.payment_date),
        method: (inserted.method as PaymentMethodFilterValue) ?? 'cash',
        reference: inserted.reference ?? null,
        notes: inserted.notes ?? null,
        received_by: inserted.received_by,
        received_by_name: input.currentUser.fullName,
        source: 'manual',
        created_at: toIsoString(inserted.created_at),
      };

      return {
        payment,
        summary: {
          total_debt: totals.totalCharges,
          total_paid: totalPaid,
          previous_balance: openBalance,
          new_balance: newBalance,
        },
        receipt_hint: `REC-${payment.id.slice(0, 8).toUpperCase()}`,
      };
    });
  };
}
