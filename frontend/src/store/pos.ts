import {
  decimalUnits,
  decimalNumber,
  lineTotalCents,
  isDecimalValue,
  isCheckoutQuantity,
} from "../utils/checkout-decimal";
import { create } from "zustand";
import type { Product } from "../types/catalog";

type CartItem = {
  productId: string;
  name: string;
  priceCash: number | null;
  priceBase: number | null;
  unitPrice: number;
  quantity: number;
  total: number;
};

type PosState = {
  items: CartItem[];
  customerId: string | null;
  sellerId: string | null;
  paymentTermId: string | null;
  discount: number;
  addProduct: (
    product: Product,
    priceField?: "price_cash" | "price_base",
  ) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  reset: () => void;
  setCustomer: (id: string | null) => void;
  setSeller: (id: string | null) => void;
  setPaymentTerm: (id: string | null) => void;
  setDiscount: (value: number) => void;
  getSubtotal: () => number;
  getTotal: () => number;
};

function checkedCart(items: CartItem[]): CartItem[] {
  if (items.some((item) => !isCheckoutQuantity(item.quantity)))
    throw new RangeError("Invalid quantity");
  decimalNumber(
    items.reduce((sum, item) => sum + decimalUnits(item.total, 2), 0n),
    2,
  );
  return items;
}

export const usePosStore = create<PosState>((set, get) => ({
  items: [],
  customerId: null,
  sellerId: null,
  paymentTermId: null,
  discount: 0,

  addProduct: (product, priceField = "price_cash") =>
    set((state) => {
      const fallbackPrice =
        priceField === "price_cash" ? product.price_base : product.price_cash;
      const unitPrice = Number(product[priceField] ?? fallbackPrice ?? 0) || 0;
      decimalUnits(unitPrice, 2);
      const existing = state.items.find(
        (item) => item.productId === product.id,
      );
      if (existing) {
        const updatedItems = state.items.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                quantity: decimalNumber(
                  decimalUnits(item.quantity, 3) + 1000n,
                  3,
                ),
                unitPrice,
                priceCash: product.price_cash ?? null,
                priceBase: product.price_base ?? null,
                total: decimalNumber(
                  lineTotalCents(
                    decimalNumber(decimalUnits(item.quantity, 3) + 1000n, 3),
                    unitPrice,
                  ),
                  2,
                ),
              }
            : item,
        );
        return { items: checkedCart(updatedItems) };
      }

      return {
        items: checkedCart([
          ...state.items,
          {
            productId: product.id,
            name: product.name,
            priceCash: product.price_cash ?? null,
            priceBase: product.price_base ?? null,
            unitPrice,
            quantity: 1,
            total: unitPrice,
          },
        ]),
      };
    }),

  updateQuantity: (productId, quantity) =>
    set((state) => {
      if (!isCheckoutQuantity(quantity))
        throw new RangeError("Invalid quantity");

      return {
        items: checkedCart(
          state.items.map((item) =>
            item.productId === productId
              ? {
                  ...item,
                  quantity,
                  total: decimalNumber(
                    lineTotalCents(quantity, item.unitPrice),
                    2,
                  ),
                }
              : item,
          ),
        ),
      };
    }),

  removeItem: (productId) =>
    set((state) => ({
      items: state.items.filter((item) => item.productId !== productId),
    })),

  reset: () =>
    set({
      items: [],
      customerId: null,
      sellerId: null,
      paymentTermId: null,
      discount: 0,
    }),

  setCustomer: (id) => set({ customerId: id }),
  setSeller: (id) => set({ sellerId: id }),
  setPaymentTerm: (id) => set({ paymentTermId: id }),
  setDiscount: (value) =>
    set((state) => (isDecimalValue(value, 2) ? { discount: value } : state)),

  getSubtotal: () =>
    decimalNumber(
      get().items.reduce((acc, item) => acc + decimalUnits(item.total, 2), 0n),
      2,
    ),

  getTotal: () => {
    const subtotal = get().getSubtotal();
    const discount = get().discount;
    const cents = decimalUnits(subtotal, 2) - decimalUnits(discount, 2);
    return decimalNumber(cents > 0n ? cents : 0n, 2);
  },
}));

export type { CartItem };
