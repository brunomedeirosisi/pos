import { forbidden, notFound } from '../../../errors.js';
import type {
  CancelSaleInputDto,
  CreateSaleInputDto,
  ListSalesQueryDto,
  SaleDto,
} from '../contracts/sales-contracts.js';
import { computeSaleTotals, mapSale, normalizeItem } from '../domain/sales-domain.js';
import type { SalesRepository } from '../repository/sales-repository.js';

export type SaleActor = {
  permissions: string[];
  discountLimit: number;
};

export function createListSalesUseCase(repository: SalesRepository) {
  return async (filters: ListSalesQueryDto): Promise<SaleDto[]> => {
    const sales = await repository.list(filters);
    return sales.map(mapSale);
  };
}

export function createCreateSaleUseCase(repository: SalesRepository) {
  return async (input: CreateSaleInputDto, actor: SaleActor | null): Promise<SaleDto> => {
    const items = input.items.map(normalizeItem);
    const { subtotal, discount, total } = computeSaleTotals(items, input.subtotal, input.discount, input.total);

    if (actor && !actor.permissions.includes('*') && discount > actor.discountLimit) {
      throw forbidden('discount exceeds allowed limit for role');
    }

    const sale = await repository.create({
      emissionDate: input.emission_date ?? new Date(),
      orderNumber: input.order_number ?? null,
      sellerId: input.seller_id ?? null,
      customerId: input.customer_id ?? null,
      paymentTermId: input.payment_term_id ?? null,
      subtotal,
      discount,
      total,
      source: input.source ?? null,
      sourceKey: input.source_key ?? null,
      items,
    });

    return mapSale(sale);
  };
}

export function createGetSaleByIdUseCase(repository: SalesRepository) {
  return async (id: string): Promise<SaleDto> => {
    const sale = await repository.findById(id);
    if (!sale) {
      throw notFound('sale not found');
    }

    return mapSale(sale);
  };
}

export function createCancelSaleUseCase(repository: SalesRepository) {
  return async (id: string, input: CancelSaleInputDto): Promise<SaleDto> => {
    const sale = await repository.cancel(id, input.reason ?? null);
    if (!sale) {
      throw notFound('sale not found');
    }

    return mapSale(sale);
  };
}