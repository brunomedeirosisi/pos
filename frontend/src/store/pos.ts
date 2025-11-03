import { create } from 'zustand';
import type { Product } from '../types/catalog';

type CartItem = {
  productId: string;
  name: string;
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
  addProduct: (product: Product, priceField?: 'price_cash' | 'price_base') => void;
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

export const usePosStore = create<PosState>((set, get) => ({
  items: [],
  customerId: null,
  sellerId: null,
  paymentTermId: null,
  discount: 0,

  addProduct: (product, priceField = 'price_cash') =>
    set((state) => {
      const unitPrice = Number(product[priceField] ?? product.price_cash ?? 0) || 0;
      const existing = state.items.find((item) => item.productId === product.id);
      if (existing) {
        const updatedItems = state.items.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                total: (item.quantity + 1) * unitPrice,
              }
            : item
        );
        return { items: updatedItems };
      }

      return {
        items: [
          ...state.items,
          {
            productId: product.id,
            name: product.name,
            unitPrice,
            quantity: 1,
            total: unitPrice,
          },
        ],
      };
    }),

  updateQuantity: (productId, quantity) =>
    set((state) => {
      if (quantity <= 0) {
        return { items: state.items.filter((item) => item.productId !== productId) };
      }

      return {
        items: state.items.map((item) =>
          item.productId === productId
            ? { ...item, quantity, total: quantity * item.unitPrice }
            : item
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
    set(() => ({
      discount: value < 0 ? 0 : value,
    })),

  getSubtotal: () => get().items.reduce((acc, item) => acc + item.total, 0),

  getTotal: () => {
    const subtotal = get().getSubtotal();
    const discount = get().discount;
    return Math.max(subtotal - discount, 0);
  },
}));

export type { CartItem };
