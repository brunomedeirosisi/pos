import {
  decimalUnits,
  decimalNumber,
  isCheckoutQuantity,
} from "../../../utils/checkout-decimal.js";
import {
  badRequest,
  forbidden,
  HttpError,
  notFound,
  unauthorized,
} from "../../../errors.js";
import type {
  CancelSaleInputDto,
  CreateSaleInputDto,
  ListSalesQueryDto,
  PrintSaleReceiptInputDto,
  SaleDto,
  SaleReceiptDto,
  SaleReceiptLocale,
} from "../contracts/sales-contracts.js";
import { mapSaleReceipt } from "../domain/sale-receipt.js";
import {
  buildCatalogPricedItems,
  computeSaleTotals,
  mapSale,
} from "../domain/sales-domain.js";
import type { SalesRepository } from "../repository/sales-repository.js";
import { saleDateSchema } from "../contracts/sales-contracts.js";
import type { PrintDelivery } from "../../print-jobs/print-jobs.js";

export type SaleActor = {
  id: string;
  permissions: string[];
  discountLimit: number;
};

type CompanyInfo = SaleReceiptDto["company"];

type SaleReceiptPrinter = {
  print: (payload: {
    receipt: SaleReceiptDto;
    copies: number;
    locale: SaleReceiptLocale;
    requestId?: string;
    printerId?: string;
  }) => Promise<PrintDelivery | void>;
  printerModel: string;
};

function resolveDiscountPercentage(subtotal: number, discount: number): number {
  if (subtotal <= 0 || discount <= 0) {
    return 0;
  }

  return Number(((discount / subtotal) * 100).toFixed(4));
}

export function createListSalesUseCase(repository: SalesRepository) {
  return async (filters: ListSalesQueryDto): Promise<SaleDto[]> => {
    const sales = await repository.list(filters);
    return sales.map(mapSale);
  };
}

export function createCreateSaleUseCase(repository: SalesRepository) {
  return async (
    input: CreateSaleInputDto,
    actor: SaleActor | null,
  ): Promise<SaleDto> => {
    if (input.items.some((item) => !isCheckoutQuantity(item.quantity)))
      throw badRequest("invalid_sale_quantity");
    const paymentMethod = input.payment_method;
    const amountPaid = input.amount_paid;
    // Keep the invariant for callers that bypass the HTTP schema as well.
    if (paymentMethod == null) {
      throw badRequest("payment_method is required for checkout");
    }
    if (amountPaid == null) {
      throw badRequest("amount_paid is required for checkout");
    }
    const parsedDate =
      input.emission_date === undefined
        ? undefined
        : saleDateSchema.safeParse(input.emission_date);
    if (parsedDate && !parsedDate.success)
      throw badRequest("invalid_sale_date");
    const today = await repository.getCurrentDate();
    const emissionDate = parsedDate?.success ? parsedDate.data : today;
    if (emissionDate > today) throw badRequest("sale_date_in_future");
    const productIds = input.items.map((item) => item.product_id);
    const catalogProducts =
      await repository.findProductsForCheckout(productIds);
    const catalogProductMap = new Map(
      catalogProducts.map((product) => [product.id, product]),
    );
    const items = buildCatalogPricedItems(
      input.items,
      catalogProductMap,
      paymentMethod,
    );
    const { subtotal, discount, total } = computeSaleTotals(
      items,
      undefined,
      input.discount,
      undefined,
    );
    const isCreditSale =
      paymentMethod === "credit" || paymentMethod === "credit_with_entry";
    if (amountPaid < total && !isCreditSale) {
      throw badRequest("amount_paid cannot be lower than sale total");
    }

    if (isCreditSale && amountPaid > total) {
      throw badRequest("amount_paid cannot exceed sale total");
    }

    if (paymentMethod === "credit" && amountPaid !== 0) {
      throw badRequest("amount_paid must be zero for credit sales");
    }

    if (paymentMethod === "credit_with_entry" && amountPaid <= 0) {
      throw badRequest(
        "amount_paid must be greater than zero for credit sales with down payment",
      );
    }

    if (isCreditSale && !input.customer_id) {
      throw badRequest("customer_id is required for credit sales");
    }

    const paidCents = decimalUnits(amountPaid, 2);
    const totalCents = decimalUnits(total, 2);
    const changeAmount = decimalNumber(
      paidCents > totalCents ? paidCents - totalCents : 0n,
      2,
    );
    const pendingAmount = decimalNumber(
      totalCents > paidCents ? totalCents - paidCents : 0n,
      2,
    );

    if (
      actor &&
      !actor.permissions.includes("*") &&
      resolveDiscountPercentage(subtotal, discount) > actor.discountLimit
    ) {
      throw forbidden("discount exceeds allowed limit for role");
    }

    if (!actor?.id) throw unauthorized();
    const sale = await repository.create({
      actorUserId: actor.id,
      emissionDate,
      paidAt: input.paid_at ?? new Date(),
      orderNumber: input.order_number ?? null,
      sellerId: input.seller_id ?? null,
      customerId: input.customer_id ?? null,
      paymentTermId: input.payment_term_id ?? null,
      paymentMethod,
      amountPaid,
      changeAmount,
      subtotal,
      discount,
      total,
      pendingAmount,
      source: input.source ?? null,
      sourceKey: input.source_key ?? null,
      items,
    });

    return mapSale({ ...sale, pending_amount: pendingAmount });
  };
}

export function createGetSaleByIdUseCase(repository: SalesRepository) {
  return async (id: string): Promise<SaleDto> => {
    const sale = await repository.findById(id);
    if (!sale) {
      throw notFound("sale not found");
    }

    return mapSale(sale);
  };
}

export function createGetSaleReceiptUseCase(
  repository: SalesRepository,
  company: CompanyInfo,
) {
  return async (
    id: string,
    locale: SaleReceiptLocale,
  ): Promise<SaleReceiptDto> => {
    const sale = await repository.findReceiptById(id);
    if (!sale) {
      throw notFound("sale not found");
    }

    return mapSaleReceipt(sale, company, locale);
  };
}

export function createCancelSaleUseCase(repository: SalesRepository) {
  return async (id: string, input: CancelSaleInputDto): Promise<SaleDto> => {
    const sale = await repository.cancel(id, input.reason ?? null);
    if (!sale) {
      throw notFound("sale not found");
    }

    return mapSale(sale);
  };
}

export function createPrintSaleReceiptUseCase(
  getSaleReceipt: ReturnType<typeof createGetSaleReceiptUseCase>,
  printer: SaleReceiptPrinter,
) {
  return async (
    id: string,
    input: PrintSaleReceiptInputDto,
  ): Promise<
    | {
        receipt_code: string;
        printer_model: string;
        printed_at: string;
        copies: number;
      }
    | (PrintDelivery & {
        receipt_code: string;
        printer_model: string;
        copies: number;
      })
  > => {
    const locale = input.locale ?? "pt-BR";
    const copies = input.copies ?? 1;
    const receipt = await getSaleReceipt(id, locale);

    try {
      const delivery = await printer.print({
        receipt,
        copies,
        locale,
        requestId: input.request_id,
        printerId: input.printer_id,
      });
      if (delivery)
        return {
          ...delivery,
          receipt_code: receipt.sale.code,
          printer_model: delivery.printer_name,
          copies,
        };
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }
      throw new HttpError(
        503,
        "receipt printer is unavailable. Check the Epson LX-300+ connection and local print agent.",
        error instanceof Error ? error.message : undefined,
      );
    }

    return {
      receipt_code: receipt.sale.code,
      printer_model: printer.printerModel,
      printed_at: new Date().toISOString(),
      copies,
    };
  };
}
