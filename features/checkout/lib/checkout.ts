import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Guest checkout (ticket 06) — the single seam for ordering behaviour.
 *
 * `placeOrder` delegates to the `place_order` Postgres function, which runs
 * as one atomic SECURITY DEFINER transaction: it row-locks and re-validates
 * stock for every cart line, upserts the guest Customer by email, inserts the
 * Order + items with price snapshots, deducts stock, and allocates the
 * per-day ORD-YYYYMMDD-XXXX number. Everything the client needs to trust —
 * stock truth, prices, atomicity — lives in that function, never here.
 *
 * This module only shapes the RPC call and maps the response into a typed
 * result. Tests exercise it against the mocked client with a faithful
 * simulation of the function's behaviour (see checkout.test.ts).
 */

export type PaymentMethod = "cod" | "ewallet" | "bank_transfer" | "bachs";

export type CheckoutDetails = {
  fullName: string;
  email: string;
  contactNumber: string;
  deliveryAddress: string;
  paymentMethod: PaymentMethod;
  notes?: string;
  // Shipping & location extensions
  stateId?: string;
  lgaId?: string | null;
  deliveryZoneId?: string | null;
  stateName?: string;
  lgaName?: string;
  cityName?: string;
  streetAddress?: string;
  recipientName?: string;
  recipientPhone?: string;
  shippingMethodId?: string;
  shippingFeeKobo?: number;
  deliveryInstructions?: string;
  landmark?: string;
};

export type CheckoutLineInput = {
  productId: string;
  quantity: number;
  selectedSize?: string;
  productName?: string;
};

/** A single rejected cart line, with what stock actually allowed. */
export type CheckoutLineIssue = {
  productId: string;
  name: string;
  /** Only present when the product exists but stock is too low. */
  available?: number;
  requested: number;
};

export type PlaceOrderResult =
  | {
      ok: true;
      orderId: string;
      orderNumber: string;
      totalAmount: number;
      shippingFee?: number;
      itemsSubtotal?: number;
      checkoutUrl?: string;
    }
  | {
      ok: false;
      code: "INSUFFICIENT_STOCK" | "PRODUCT_UNAVAILABLE";
      message: string;
      items: CheckoutLineIssue[];
    }
  | {
      ok: false;
      code: "VALIDATION" | "SHIPPING_UNAVAILABLE";
      message: string;
      /** Which form field, when the Server Action rejected the input. */
      field?: string;
    }
  | {
      ok: false;
      code: "UNKNOWN";
      message: string;
    };

export async function placeOrder(
  client: SupabaseClient,
  details: CheckoutDetails,
  items: CheckoutLineInput[],
): Promise<PlaceOrderResult> {
  const baseParams = {
    p_full_name: details.fullName,
    p_email: details.email,
    p_contact_number: details.contactNumber,
    p_delivery_address: details.deliveryAddress,
    p_payment_method: details.paymentMethod,
    p_notes: details.notes?.trim() ? details.notes : null,
    p_items: items.map((line) => ({
      product_id: line.productId,
      quantity: line.quantity,
      size: line.selectedSize || null,
    })),
  };

  const extendedParams = {
    ...baseParams,
    p_shipping_method_id: details.shippingMethodId || null,
    p_shipping_fee_kobo: details.shippingFeeKobo || 0,
    p_state_id: details.stateId || null,
    p_lga_id: details.lgaId || null,
    p_delivery_zone_id: details.deliveryZoneId || null,
    p_state_name: details.stateName || null,
    p_lga_name: details.lgaName || null,
    p_city_name: details.cityName || null,
    p_street_address: details.streetAddress || details.deliveryAddress,
    p_recipient_name: details.recipientName || details.fullName,
    p_recipient_phone: details.recipientPhone || details.contactNumber,
  };

  let { data, error } = await client.rpc("place_order", extendedParams);

  // If extended signature fails due to unapplied migration, fallback to base params
  if (error && error.message && (error.message.includes("parameter") || error.message.includes("function public.place_order"))) {
    const fallbackRes = await client.rpc("place_order", baseParams);
    data = fallbackRes.data;
    error = fallbackRes.error;
  }

  // Transport/DB-level failure (network, timeout, unapplied migration).
  if (error) {
    return { ok: false, code: "UNKNOWN", message: error.message };
  }

  // The function answers with snake_case keys (product_id, order_id, ...);
  // map the response into the camelCase public shape below.
  const result = data as
    | {
        ok?: boolean;
        order_id?: string;
        order_number?: string;
        total_amount?: number;
        code?: string;
        message?: string;
        items?: {
          product_id: string;
          name: string;
          available?: number;
          requested: number;
        }[];
      }
    | null
    | undefined;

  if (!result || result.ok !== true) {
    const code = result?.code;
    if (code === "INSUFFICIENT_STOCK" || code === "PRODUCT_UNAVAILABLE") {
      return {
        ok: false,
        code,
        message: result?.message ?? "Your order could not be placed.",
        items: (result?.items ?? []).map((line) => ({
          productId: line.product_id,
          name: line.name,
          available: line.available,
          requested: line.requested,
        })),
      };
    }
    if (code === "VALIDATION") {
      return {
        ok: false,
        code: "VALIDATION",
        message: result?.message ?? "Your order details need a second look.",
      };
    }
    return {
      ok: false,
      code: "UNKNOWN",
      message: result?.message ?? "Something went wrong placing your order.",
    };
  }

  return {
    ok: true,
    orderId: result.order_id ?? "",
    orderNumber: result.order_number ?? "",
    totalAmount: result.total_amount ?? 0,
    shippingFee: (result as any).shipping_fee ?? 0,
    itemsSubtotal: (result as any).items_subtotal ?? (result.total_amount ?? 0),
  };
}
