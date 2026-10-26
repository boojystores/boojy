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

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const PAYMENT_METHODS: PaymentMethod[] = ["ewallet", "bank_transfer", "bachs"];

// Sliding window rate limiter: max 5 requests per 60 seconds per IP address
const ipRateLimits = new Map<string, number[]>();

function checkRateLimit(ip: string, maxRequests = 5, windowMs = 60_000): boolean {
  const now = Date.now();
  const timestamps = (ipRateLimits.get(ip) || []).filter((ts) => now - ts < windowMs);
  
  if (timestamps.length >= maxRequests) {
    return false;
  }
  
  timestamps.push(now);
  ipRateLimits.set(ip, timestamps);
  return true;
}

// Defensive input sanitization: strips HTML tags and non-printable control characters
function sanitizeInput(str?: string | null, maxLength = 300): string {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .trim()
    .slice(0, maxLength);
}

export type CheckoutActionResponse = PlaceOrderResult;

export async function submitCheckout(input: {
  details: CheckoutDetails;
  items: CheckoutLineInput[];
}): Promise<CheckoutActionResponse> {
  const { details, items } = input;

  // Rate limiting check
  let clientIp = "127.0.0.1";
  try {
    const headersList = await headers();
    const forwardedFor = headersList.get("x-forwarded-for");
    clientIp = headersList.get("x-real-ip") || (forwardedFor ? forwardedFor.split(",")[0].trim() : "127.0.0.1");
  } catch {
    // Fallback when called outside a Next.js request context (e.g. unit tests)
    clientIp = "127.0.0.1";
  }

  if (!checkRateLimit(clientIp)) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Too many checkout requests. Please wait a moment before trying again.",
    };
  }

  // Defensive field sanitization
  if (details) {
    if (details.fullName) details.fullName = sanitizeInput(details.fullName, 100);
    if (details.deliveryAddress) details.deliveryAddress = sanitizeInput(details.deliveryAddress, 300);
    if (details.streetAddress) details.streetAddress = sanitizeInput(details.streetAddress, 300);
    if (details.landmark) details.landmark = sanitizeInput(details.landmark, 150);
    if (details.notes) details.notes = sanitizeInput(details.notes, 500);
    if (details.recipientName) details.recipientName = sanitizeInput(details.recipientName, 100);
    if (details.cityName) details.cityName = sanitizeInput(details.cityName, 100);
  }

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
      message: "Enter a valid email address with a domain (e.g. name@example.com).",
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
  const phoneTrimmed = details.contactNumber.trim();
  if (/[a-zA-Z]/.test(phoneTrimmed) || !/^[0-9+\s\-()]+$/.test(phoneTrimmed)) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Contact number must be numeric (e.g. 08012345678). Letters are not allowed.",
      field: "contactNumber",
    };
  }
  const digits = phoneTrimmed.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Contact number must be a valid phone number (10 to 15 digits).",
      field: "contactNumber",
    };
  }
  if (details.recipientPhone) {
    const recipientPhoneTrimmed = details.recipientPhone.trim();
    if (/[a-zA-Z]/.test(recipientPhoneTrimmed) || !/^[0-9+\s\-()]+$/.test(recipientPhoneTrimmed)) {
      return {
        ok: false,
        code: "VALIDATION",
        message: "Delivery phone number must be numeric. Letters are not allowed.",
        field: "contactNumber",
      };
    }
  }
  if (details.shippingMethodId === "pickup") {
    if (!details.deliveryAddress || !details.deliveryAddress.trim()) {
      details.deliveryAddress = "Store Pickup — Boojy Flagship Store, Victoria Island, Lagos";
    }
  } else if (
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

  // Validate that the payment method is currently enabled by store admin
  try {
    const { getPaymentMethodsConfig } = await import("@/features/admin/actions/payments");
    const configuredMethods = await getPaymentMethodsConfig();
    const selectedConfig = configuredMethods.find((m) => m.id === details.paymentMethod);
    if (selectedConfig && !selectedConfig.enabled) {
      return {
        ok: false,
        code: "VALIDATION",
        message: `"${selectedConfig.name}" is currently turned off. Please select another payment method.`,
        field: "paymentMethod",
      };
    }
  } catch {
    // If config lookup fails, allow default methods to proceed
  }

  if (details.paymentMethod === "bachs" && !isBachsConfigured()) {
    return {
      ok: false,
      code: "VALIDATION",
      message: "Online card & bank payment is not currently configured. Please select another payment method or contact support.",
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

  // --- Authoritative Server-side Shipping Validation & Calculation ---
  let verifiedShippingFeeKobo = 0;
  let verifiedShippingMethodName: string | undefined;

  if (details.shippingMethodId === "pickup") {
    verifiedShippingFeeKobo = 0;
    verifiedShippingMethodName = "Store Pickup";
    details.shippingFeeKobo = 0;
    details.shippingMethodId = "pickup";
    if (!details.deliveryAddress || !details.deliveryAddress.trim()) {
      details.deliveryAddress = "Store Pickup — Boojy Flagship Store, Victoria Island, Lagos";
    }
  } else if (details.stateId) {
    const { calculateShippingOptionsServer } = await import("@/features/shipping/actions");
    const shippingCalc = await calculateShippingOptionsServer({
      stateId: details.stateId,
      lgaId: details.lgaId,
      deliveryZoneId: details.deliveryZoneId,
      shippingMethodId: details.shippingMethodId,
      subtotalKobo: 0,
    });

    if (!shippingCalc.available || shippingCalc.options.length === 0) {
      return {
        ok: false,
        code: "SHIPPING_UNAVAILABLE",
        message: "Delivery is currently not available to the selected location.",
      };
    }

    const matchedOption = details.shippingMethodId
      ? shippingCalc.options.find((opt) => opt.methodId === details.shippingMethodId)
      : shippingCalc.options[0];

    if (!matchedOption) {
      return {
        ok: false,
        code: "SHIPPING_UNAVAILABLE",
        message: "The chosen delivery method is not available for this location.",
      };
    }

    verifiedShippingFeeKobo = matchedOption.priceKobo;
    verifiedShippingMethodName = matchedOption.methodName;
    details.shippingFeeKobo = verifiedShippingFeeKobo;
    details.shippingMethodId = matchedOption.methodId;
  }

  const supabase = await createClient();
  const orderResult = await placeOrder(supabase, details, items);

  if (!orderResult.ok) {
    return orderResult;
  }

  // Ensure order row has full shipping & delivery snapshot persisted in Supabase
  try {
    const serviceClient = createServiceClient();
    const verifiedShippingFeeNaira = Math.round(verifiedShippingFeeKobo / 100);
    const updatePayload: any = {
      recipient_name: details.recipientName || details.fullName,
      recipient_phone: details.recipientPhone || details.contactNumber,
      state_name: details.stateName || null,
      lga_name: details.lgaName || null,
      city_name: details.cityName || null,
      street_address: details.streetAddress
        ? details.landmark
          ? `${details.streetAddress} (Landmark: ${details.landmark})`
          : details.streetAddress
        : details.deliveryAddress,
      delivery_instructions: details.notes || null,
      shipping_fee_kobo: verifiedShippingFeeKobo,
      shipping_fee: verifiedShippingFeeNaira,
      shipping_method_id: details.shippingMethodId || null,
      shipping_method_name: verifiedShippingMethodName || null,
    };

    // If orderResult total did not include shipping fee (e.g. if place_order fell back), adjust total_amount
    if (verifiedShippingFeeNaira > 0 && orderResult.totalAmount <= (orderResult.itemsSubtotal || 0)) {
      updatePayload.total_amount = orderResult.totalAmount + verifiedShippingFeeNaira;
      orderResult.totalAmount = updatePayload.total_amount;
    }

    await serviceClient.from("orders").update(updatePayload).eq("id", orderResult.orderId);
  } catch (snapErr) {
    console.warn("[Order Shipping Snapshot Warn]:", snapErr);
  }

  // If customer chose Bachs, create the Bachs Checkout Session
  if (details.paymentMethod === "bachs") {
    try {
      const headersList = await headers();
      const host = headersList.get("x-forwarded-host") || headersList.get("host");
      const proto = headersList.get("x-forwarded-proto") || (host?.startsWith("localhost") ? "http" : "https");
      let siteUrl = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_SITE_URL || "https://boojy.vercel.app");
      if (siteUrl.includes("localhost") || siteUrl.includes("127.0.0.1")) {
        siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://boojy.vercel.app";
      }

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
        message: `Unable to initiate secure payment${detail}. Please try again or select another payment method.`,
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
  shippingFee?: number;
  shippingMethodName?: string;
  items?: { name: string; quantity: number; unitPrice: number }[];
  checkoutUrl?: string;
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
      shipping_fee,
      shipping_method_name,
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
  let reconciledCheckoutUrl: string | undefined;

  if (
    order.payment_status === "pending" &&
    order.payment_provider === "bachs" &&
    order.bachs_checkout_id &&
    isBachsConfigured()
  ) {
    try {
      const bachs = getBachsClient();
      const session = await bachs.checkoutSessions.get(order.bachs_checkout_id);
      reconciledCheckoutUrl = (session as { checkout_url?: string }).checkout_url || undefined;

      const isSuccess =
        session.payment_status === "succeeded" ||
        session.payment_status === "accepted" ||
        session.payment_status === "paid" ||
        session.status === "completed" ||
        session.status === "paid" ||
        session.status === "succeeded" ||
        session.charge?.status === "succeeded" ||
        session.charge?.status === "accepted" ||
        session.charge?.status === "paid";

      const isFailedOrCancelled =
        session.payment_status === "failed" ||
        session.payment_status === "cancelled" ||
        session.payment_status === "expired" ||
        session.status === "cancelled" ||
        session.status === "expired" ||
        session.status === "failed" ||
        session.charge?.status === "failed" ||
        session.charge?.status === "cancelled";

      if (isSuccess) {
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
      } else if (isFailedOrCancelled) {
        await serviceClient.rpc("handle_bachs_payment_failure", {
          p_order_id: order.id,
          p_reason: `Bachs session ${session.status} (${session.payment_status || "failed"})`,
          p_restore_stock: true,
        });
        order.payment_status = "failed";
        order.status = "cancelled";
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
    shippingFee: (order as any).shipping_fee != null ? Number((order as any).shipping_fee) : undefined,
    shippingMethodName: (order as any).shipping_method_name || undefined,
    createdAt: order.created_at,
    customerName: customer?.full_name,
    customerEmail: customer?.email,
    items,
    checkoutUrl: reconciledCheckoutUrl,
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
    const host = headersList.get("x-forwarded-host") || headersList.get("host");
    const proto = headersList.get("x-forwarded-proto") || (host?.startsWith("localhost") ? "http" : "https");
    const siteUrl = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");

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
