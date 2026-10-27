"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Product } from "@/features/catalog/lib/catalog";

/**
 * The shopping Cart (ticket 05): a client-side selection of Products, persisted
 * to localStorage so it survives refreshes and visits. Quantities are capped at
 * the stock snapshot taken when the item was added — a UX guarantee only; stock
 * is re-validated server-side at checkout (ticket 06), never here.
 */

export type CartItem = {
  id: string;
  productId?: string;
  name: string;
  price: number;
  image_url: string;
  stock_quantity: number;
  quantity: number;
  selected_size?: string;
  variant_id?: string;
  /**
   * Set by reconciliation (ADR-0013) when the Product no longer exists or is
   * no longer active. Unavailable lines stay visible so the Customer can see
   * and remove them; they block checkout until removed.
   */
  unavailable?: boolean;
};

export type CartReconcileResult = {
  /** Product ids whose display data or quantity changed to match the catalog. */
  updated: string[];
  /** Product ids newly flagged as unavailable (deleted or retired). */
  unavailable: string[];
};

export type CartState = {
  items: CartItem[];
  /** Adds a Product (or increments an existing line) capped at stock, with optional clothing size. */
  addItem: (product: Product, quantity?: number, selectedSize?: string) => void;
  /** Sets a line's quantity; clamped to [1, stock]. */
  updateQuantity: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  /** Success callback seam: checkout (ticket 06) calls this after an Order. */
  clearCart: () => void;
  /**
   * Brings the cart in line with the live Catalog (ADR-0013): refreshes
   * prices/stock/names/images, clamps quantities to live stock, and flags
   * retired Products. Returns what changed so the UI can tell the Customer.
   */
  reconcile: (liveProducts: readonly Product[]) => CartReconcileResult;
  /** True once localStorage has been rehydrated on the client. */
  hasHydrated: boolean;
  setHasHydrated: (hydrated: boolean) => void;
};

// localStorage is only available on the client. Zustand's persist middleware
// runs during module init, so on the server we hand it a no-op storage —
// nothing is ever hydrated there, and it never writes.
const noopStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

/** Zustand persist key. The payment handoff page clears this after an order is placed. */
export const CART_STORAGE_KEY = "boojy-cart";

const clientStorage = createJSONStorage(() =>
  typeof window !== "undefined" ? window.localStorage : noopStorage,
);

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      hasHydrated: false,
      setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),

      addItem: (product, quantity = 1, selectedSize) =>
        set((state) => {
          // If product has size variants, find the specific variant's stock
          const matchingVariant =
            selectedSize && product.variants && product.variants.length > 0
              ? product.variants.find(
                  (v) => v.size.toLowerCase() === selectedSize.toLowerCase(),
                )
              : undefined;

          const effectiveStock = matchingVariant
            ? matchingVariant.stock_quantity
            : product.stock_quantity;

          // Never let an out-of-stock Product or variant into the cart as a phantom
          // zero-quantity line — the UI blocks this, but the store is the seam.
          if (effectiveStock <= 0) return state;

          const lineId = selectedSize ? `${product.id}::${selectedSize}` : product.id;
          const existing = state.items.find((item) => item.id === lineId);
          const qty = Math.max(1, Math.floor(quantity));

          if (existing) {
            return {
              items: state.items.map((item) =>
                item.id === lineId
                  ? {
                      ...item,
                      stock_quantity: effectiveStock,
                      quantity: Math.min(
                        item.quantity + qty,
                        effectiveStock,
                      ),
                    }
                  : item,
              ),
            };
          }

          const line: CartItem = {
            id: lineId,
            productId: product.id,
            name: product.name,
            price: product.price,
            image_url: product.image_url,
            stock_quantity: effectiveStock,
            quantity: Math.min(qty, effectiveStock),
            selected_size: selectedSize || undefined,
            variant_id: matchingVariant?.id,
          };
          return { items: [...state.items, line] };
        }),

      updateQuantity: (productId, quantity) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === productId
              ? {
                  ...item,
                  // Clamp to [1, stock]. If stock dropped to 0 after adding,
                  // hold the line at 1 rather than creating a zero-quantity row
                  // (the cart page flags it as out of stock for removal).
                  quantity: Math.min(
                    Math.max(1, Math.floor(quantity)),
                    Math.max(1, item.stock_quantity),
                  ),
                }
              : item,
          ),
        })),

      removeItem: (productId) =>
        set((state) => ({
          items: state.items.filter((item) => item.id !== productId),
        })),

      clearCart: () => set({ items: [] }),

      // `useCartStore` is referenced only when the action runs (after the
      // store exists), so the circular reference is safe.
      reconcile: (liveProducts) => {
        const current = useCartStore.getState().items;
        const { items, result } = reconcileCart(current, liveProducts);
        // Nothing changed: keep the same array reference so subscribers and
        // localStorage are not touched on every page visit or Realtime event.
        if (result.updated.length === 0 && result.unavailable.length === 0) {
          return { updated: [], unavailable: [] };
        }
        set({ items });
        return result;
      },
    }),
    {
      name: CART_STORAGE_KEY,
      storage: clientStorage,
      // Only cart lines are persisted — the hydration flag is transient.
      partialize: (state) => ({ items: state.items }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

/** Derived: total number of units in the cart. */
export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

/** Derived: subtotal before shipping (prices are snapshots at add time). */
export function cartSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

/**
 * Brings cart lines in line with the live Catalog (ADR-0013). For every line:
 * refresh name/price/image/stock from the current Product row, clamp the
 * quantity to live stock (holding at 1 like `updateQuantity`), and flag
 * Products that are gone or no longer active. Deleted Products simply do not
 * appear in the fetched list; retired ones come back with `status !== "active"`.
 * Only genuinely new changes are reported, so the UI never re-announces an
 * already-synced cart.
 */
export function reconcileCart(
  items: CartItem[],
  liveProducts: readonly Product[],
): { items: CartItem[]; result: CartReconcileResult } {
  const live = new Map(liveProducts.map((product) => [product.id, product]));
  const result: CartReconcileResult = { updated: [], unavailable: [] };

  const nextItems = items.map((item) => {
    const baseProductId = item.productId || item.id.split("::")[0];
    const product = live.get(baseProductId);

    // Deleted or retired: flag, keep the line visible for removal, and do not
    // touch its snapshot data (it is the only record left of what was bought).
    if (!product || product.status !== "active") {
      if (!item.unavailable) result.unavailable.push(item.id);
      return { ...item, unavailable: true };
    }

    let liveStock = product.stock_quantity;
    let variantId = item.variant_id;
    let variantActive = true;

    if (item.selected_size && product.variants && product.variants.length > 0) {
      const variant = product.variants.find(
        (v) => v.size.toLowerCase() === item.selected_size?.toLowerCase(),
      );
      if (!variant || variant.status !== "active") {
        variantActive = false;
        liveStock = 0;
      } else {
        liveStock = variant.stock_quantity;
        variantId = variant.id;
      }
    }

    // Flag unavailable if product is retired, variant retired, or stock is 0
    if (!variantActive || liveStock <= 0) {
      if (!item.unavailable) result.unavailable.push(item.id);
      return {
        ...item,
        name: product.name,
        price: product.price,
        image_url: product.image_url,
        stock_quantity: liveStock,
        variant_id: variantId,
        quantity: 1,
        unavailable: true,
      };
    }

    const quantity = Math.min(item.quantity, Math.max(1, liveStock));
    const changed =
      item.name !== product.name ||
      item.price !== product.price ||
      item.image_url !== product.image_url ||
      item.stock_quantity !== liveStock ||
      item.quantity !== quantity ||
      item.unavailable === true ||
      item.variant_id !== variantId;
    if (changed) result.updated.push(item.id);

    return {
      ...item,
      name: product.name,
      price: product.price,
      image_url: product.image_url,
      stock_quantity: liveStock,
      quantity,
      variant_id: variantId,
      unavailable: false,
    };
  });

  return { items: nextItems, result };
}
