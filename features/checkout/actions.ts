"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  placeOrder,
  type CheckoutDetails,
  type CheckoutLineInput,
  type PaymentMethod,
  type PlaceOrderResult,
} from "@/features/checkout/lib/checkout";
import {
  createBachsCheckoutSession,
  getBachsClient,
  isBachsConfigured,
} from "@/lib/bachs";

/**
 * Guest checkout submission (ticket 06). Runs on the server, so the write
 * path is never trusted from the client (ADR-0004). It re-validates the form
 * and cart shape, then delegates to the atomic `place_order` Postgres
 * function, which re-checks live stock and rejects with per-item detail.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PAYMENT_METHODS: PaymentMethod[] = ["ewallet", "bank_transfer", "bachs"];

export type CheckoutActionResponse = PlaceOrderResult;

export async function submitCheckout(input: {
  details: CheckoutDetails;
  items: CheckoutLineInput[];
}): Promise<CheckoutActionResponse> {
  const { details, items } = input;

  // --- server-side form validation (authoritative, ADR-0004 — the client
  // pass is convenience only). ---
  if (
    !details ||
    typeof details.fullName !== "string" ||
    !details.fullName.trim()
  ) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Full name is required.",
      field: "fullName",
    };
  }
  if (typeof details.email !== "string" || !EMAIL_RE.test(details.email.trim())) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Enter a valid email address.",
      field: "email",
    };
  }
  if (
    typeof details.contactNumber !== "string" ||
    !details.contactNumber.trim()
  ) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Contact number is required.",
      field: "contactNumber",
    };
  }
  if (
    typeof details.deliveryAddress !== "string" ||
    !details.deliveryAddress.trim()
  ) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Delivery address is required.",
      field: "deliveryAddress",
    };
  }
  if (!PAYMENT_METHODS.includes(details.paymentMethod as PaymentMethod)) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Choose a payment method.",
      field: "paymentMethod",
    };
  }

  if (details.paymentMethod === "bachs" && !isBachsConfigured()) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Online payment via Bachs is not currently configured. Please select another payment method or contact support.",
      field: "paymentMethod",
    };
  }

  // --- cart shape validation (server-only: the client's cart is trusted last) ---
  if (!Array.isArray(items) || items.length === 0) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Your shopping bag is empty. Add a few items before checking out.",
    };
  }
  for (const line of items) {
    if (
      !line ||
      typeof line.productId !== "string" ||
      !Number.isInteger(line.quantity) ||
      line.quantity < 1
    ) {
      return {
        ok: false,
        code: "VALIDATION",
        message: "Your cart contains an invalid line. Review it and try again.",
      };
    }
  }

  const supabase = await createClient();
  const orderResult = await placeOrder(supabase, details, items);

  if (!orderResult.ok) {
    return orderResult;
  }

  // If customer chose Bachs, create the Bachs Checkout Session
  if (details.paymentMethod === "bachs") {
    try {
      const headersList = await headers();
      const host = headersList.get("x-forwarded-host") || headersList.get("host") || "localhost:3000";
      const proto = headersList.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
      const isLocalHost = host.includes("localhost") || host.includes("127.0.0.1");
      const siteUrl = isLocalHost
        ? `${proto}://${host}`
        : (process.env.NEXT_PUBLIC_SITE_URL || `${proto}://${host}`);

      const session = await createBachsCheckoutSession({
        orderId: orderResult.orderId,
        orderNumber: orderResult.orderNumber,
        totalAmount: orderResult.totalAmount,
        customer: {
          fullName: details.fullName,
          email: details.email,
          contactNumber: details.contactNumber,
        },
        siteUrl,
      });

      // Persist the checkout ID and reference to the order row
      const serviceClient = createServiceClient();
      await serviceClient
        .from("orders")
        .update({
          bachs_checkout_id: session.checkout_id,
          payment_reference: orderResult.orderId,
          payment_provider: "bachs",
          payment_status: "pending",
        })
        .eq("id", orderResult.orderId);

      return {
        ...orderResult,
        checkoutUrl: session.checkout_url,
      };
    } catch (error) {
      console.error("[Bachs Checkout Session Error]:", error);
      // Cancel the order and restore stock so the user's cart is not locked
      const serviceClient = createServiceClient();
      await serviceClient.rpc("handle_bachs_payment_failure", {
        p_order_id: orderResult.orderId,
        p_reason: error instanceof Error ? error.message : "Checkout session creation failed",
        p_restore_stock: true,
      });

      const detail = error instanceof Error ? `: ${error.message}` : "";
      return {
        ok: false,
        code: "UNKNOWN",
        message: `Unable to initiate secure checkout with Bachs${detail}. Please try again or select another payment method.`,
      };
    }
  }

  return orderResult;
}

export type OrderPaymentStatusResult = {
  ok: boolean;
  orderNumber?: string;
  totalAmount?: number;
  status?: string;
  paymentMethod?: PaymentMethod;
  paymentStatus?: string;
  paymentProvider?: string;
  paidAt?: string | null;
  createdAt?: string;
  customerName?: string;
  customerEmail?: string;
  deliveryAddress?: string;
  items?: { name: string; quantity: number; unitPrice: number }[];
  message?: string;
};

/**
 * Trusted backend order status check for payment return pages.
 * Never trusts URL query parameters as proof of payment.
 */
export async function getOrderPaymentStatus(orderId: string): Promise<OrderPaymentStatusResult> {
  if (!orderId || typeof orderId !== "string") {
    return { ok: false, message: "Invalid order ID." };
  }

  const serviceClient = createServiceClient();
  const { data: order, error } = await serviceClient
    .from("orders")
    .select(`
      id,
      order_number,
      total_amount,
      status,
      payment_method,
      payment_status,
      payment_provider,
      bachs_checkout_id,
      paid_at,
      delivery_address,
      created_at,
      customer_id,
      customers (
        full_name,
        email
      ),
      order_items (
        id,
        product_name,
        quantity,
        unit_price
      )
    `)
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) {
    return { ok: false, message: "Order not found." };
  }

  // Active reconciliation: if the order is still pending with Bachs, check Bachs directly
  // so the return page can confirm payment even if the webhook was delayed or blocked.
  if (
    order.payment_status === "pending" &&
    order.payment_provider === "bachs" &&
    order.bachs_checkout_id &&
    isBachsConfigured()
  ) {
    try {
      const bachs = getBachsClient();
      const session = await bachs.checkoutSessions.get(order.bachs_checkout_id);
      if (session.payment_status === "succeeded" || session.status === "completed") {
        const charge = session.charge;
        const chargeId = charge?.payment_id || session.checkout_id;
        const amountPaid = charge?.amount_paid ? parseFloat(charge.amount_paid) : Number(session.amount);

        await serviceClient.rpc("confirm_bachs_payment", {
          p_order_id: order.id,
          p_charge_id: chargeId,
          p_payment_reference: session.reference || order.id,
          p_amount: amountPaid,
          p_currency: session.currency || "NGN",
          p_metadata: {
            session_status: session.status,
            payment_status: session.payment_status,
            reconciled_via: "checkout_return_sync",
            charge: session.charge,
          },
        });

        order.payment_status = "paid";
        order.status = "processing";
        order.paid_at = charge?.completed_at || new Date().toISOString();
      }
    } catch (syncErr) {
      console.warn("[Bachs Session Sync Warn]:", syncErr);
    }
  }

  const customerData = order.customers as { full_name?: string; email?: string } | { full_name?: string; email?: string }[] | null;
  const customer = Array.isArray(customerData) ? customerData[0] : customerData;

  const rawItems = (order as { order_items?: { product_name: string; quantity: number; unit_price: number }[] }).order_items;
  const items = Array.isArray(rawItems)
    ? rawItems.map((it) => ({
        name: it.product_name,
        quantity: Number(it.quantity),
        unitPrice: Number(it.unit_price),
      }))
    : [];

  return {
    ok: true,
    orderNumber: order.order_number,
    totalAmount: Number(order.total_amount),
    status: order.status,
    paymentMethod: (order.payment_method || "bachs") as PaymentMethod,
    paymentStatus: order.payment_status || "pending",
    paymentProvider: order.payment_provider || undefined,
    paidAt: order.paid_at,
    deliveryAddress: order.delivery_address || "",
    createdAt: order.created_at,
    customerName: customer?.full_name,
    customerEmail: customer?.email,
    items,
  };
}

/**
 * Creates a new Bachs checkout session to retry payment for a pending or failed order.
 */
export async function retryBachsPayment(
  orderId: string,
): Promise<{ ok: boolean; checkoutUrl?: string; message?: string }> {
  if (!orderId || typeof orderId !== "string") {
    return { ok: false, message: "Invalid order ID." };
  }

  const serviceClient = createServiceClient();
  const { data: order, error } = await serviceClient
    .from("orders")
    .select(`
      id,
      order_number,
      total_amount,
      status,
      payment_status,
      customers (
        full_name,
        email,
        contact_number
      )
    `)
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) {
    return { ok: false, message: "Order not found." };
  }

  if (order.payment_status === "paid") {
    return { ok: false, message: "This order is already paid." };
  }

  const customerData = order.customers as { full_name?: string; email?: string; contact_number?: string } | { full_name?: string; email?: string; contact_number?: string }[] | null;
  const customer = Array.isArray(customerData) ? customerData[0] : customerData;

  try {
    const headersList = await headers();
    const host = headersList.get("x-forwarded-host") || headersList.get("host") || "localhost:3000";
    const proto = headersList.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || `${proto}://${host}`;

    const session = await createBachsCheckoutSession({
      orderId: order.id,
      orderNumber: order.order_number,
      totalAmount: Number(order.total_amount),
      customer: {
        fullName: customer?.full_name || "Valued Customer",
        email: customer?.email || "customer@example.com",
        contactNumber: customer?.contact_number,
      },
      siteUrl,
    });

    await serviceClient
      .from("orders")
      .update({
        bachs_checkout_id: session.checkout_id,
        payment_status: "pending",
        status: "pending",
      })
      .eq("id", order.id);

    return { ok: true, checkoutUrl: session.checkout_url };
  } catch (err) {
    console.error("[Retry Bachs Payment Error]:", err);
    return {
      ok: false,
      message: "Could not initiate payment retry. Please try again later.",
    };
  }
}
