import type { SaleInput } from "../../types/sales";
import type { CartItem } from "../../store/pos";
import { isCheckoutQuantity } from "../../utils/checkout-decimal";

type BuildSaleInputParams = {
  saleDate: string;
  orderNumber: string;
  customerId: string | null;
  sellerId: string | null;
  paymentTermId: string | null;
  paymentMethod: SaleInput["payment_method"];
  amountPaid: number;
  changeAmount: number;
  subtotal: number;
  discount: number;
  total: number;
  pendingAmount: number;
  items: CartItem[];
};

function normalizeOptionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function buildSaleInput(params: BuildSaleInputParams): SaleInput {
  if (params.items.some((item) => !isCheckoutQuantity(item.quantity)))
    throw new RangeError("Invalid quantity");
  return {
    emission_date: params.saleDate,
    order_number: normalizeOptionalText(params.orderNumber),
    customer_id: params.customerId,
    seller_id: params.sellerId,
    payment_term_id: params.paymentTermId,
    payment_method: params.paymentMethod,
    amount_paid: params.amountPaid,
    change_amount: params.changeAmount,
    subtotal: params.subtotal,
    discount: params.discount,
    total: params.total,
    items: params.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total: item.total,
    })),
  };
}
