import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getBachsClient, createBachsCheckoutSession, isBachsConfigured } from "@/lib/bachs";
import { submitCheckout } from "@/features/checkout/actions";
import { isValidPaymentGatewayUrl } from "@/features/checkout/lib/navigation";
import {
  paymentErrorDocument,
  paymentGatewayDocument,
} from "@/features/checkout/lib/payment-redirect";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
};

/**
 * Payment handoff.
 *
 * iOS Safari drops `window.location` changes that happen after an async
 * checkout call. Android still performs them. Checkout therefore submits a
 * real form POST (same turn as the tap). This route places the order and
 * redirects, same-origin, to the GET handoff. That document meta-refreshes
 * onto the payment gateway, which WebKit follows. A bare cross-origin 303
 * after a scripted navigation does not open on iOS.
 */

function htmlResponse(body: string, status = 200) {
  return new NextResponse(body, { status, headers: HTML_HEADERS });
}

function gatewayResponse(checkoutUrl: string) {
  const html = paymentGatewayDocument(checkoutUrl);
  if (!html) return null;
  return htmlResponse(html);
}

function isSameSitePost(request: Request): boolean {
  const requestOrigin = new URL(request.url).origin;
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin" || fetchSite === "same-site") return true;

  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    try {
      return new URL(origin).origin === requestOrigin;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === requestOrigin;
  } catch {
    return false;
  }
}

type OrderRow = {
  id: string;
  order_number: string;
  total_amount: number;
  payment_status: string | null;
  bachs_checkout_id: string | null;
  payment_metadata: Record<string, unknown> | null;
  customers:
    | { full_name?: string | null; email?: string | null; contact_number?: string | null }
    | { full_name?: string | null; email?: string | null; contact_number?: string | null }[]
    | null;
};

function reusableCheckoutUrl(order: OrderRow): string | null {
  const status = order.payment_status;
  if (status === "failed" || status === "cancelled") return null;
  const metadata = order.payment_metadata || {};
  const saved = metadata.checkout_url;
  if (typeof saved === "string" && isValidPaymentGatewayUrl(saved)) return saved;
  return null;
}

async function resolveGatewayUrl(order: OrderRow, siteOrigin: string): Promise<string | null> {
  const saved = reusableCheckoutUrl(order);
  if (saved) return saved;

  const metadata = order.payment_metadata || {};

  if (order.bachs_checkout_id && order.payment_status !== "failed" && order.payment_status !== "cancelled" && isBachsConfigured()) {
    try {
      const bachs = getBachsClient();
      const session = (await bachs.checkoutSessions.get(order.bachs_checkout_id)) as { checkout_url?: string };
      if (session.checkout_url && isValidPaymentGatewayUrl(session.checkout_url)) {
        const serviceClient = createServiceClient();
        await serviceClient
          .from("orders")
          .update({
            payment_metadata: { ...metadata, checkout_url: session.checkout_url },
          })
          .eq("id", order.id);
        return session.checkout_url;
      }
    } catch (sessionErr) {
      console.warn("[Checkout Pay Route] Failed to get existing Bachs session:", sessionErr);
    }
  }

  if (!isBachsConfigured()) return null;

  const serviceClient = createServiceClient();
  const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers;
  const cleanSiteUrl = (process.env.NEXT_PUBLIC_SITE_URL || siteOrigin).replace(/\/+$/, "");

  const session = await createBachsCheckoutSession({
    orderId: order.id,
    orderNumber: order.order_number,
    totalAmount: Number(order.total_amount),
    customer: {
      fullName: customer?.full_name || "Valued Customer",
      email: customer?.email || "customer@example.com",
      contactNumber: customer?.contact_number || undefined,
    },
    siteUrl: cleanSiteUrl,
  });

  if (!isValidPaymentGatewayUrl(session.checkout_url)) return null;

  await serviceClient
    .from("orders")
    .update({
      bachs_checkout_id: session.checkout_id,
      payment_reference: order.id,
      payment_provider: "bachs",
      payment_status: "pending",
      payment_metadata: { ...metadata, checkout_url: session.checkout_url },
    })
    .eq("id", order.id);

  return session.checkout_url;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderId = searchParams.get("order_id");
  const siteOrigin = new URL(request.url).origin;

  if (!orderId) {
    return NextResponse.redirect(`${siteOrigin}/cart`, { status: 303 });
  }

  try {
    const serviceClient = createServiceClient();
    const { data: order, error } = await serviceClient
      .from("orders")
      .select(`
        id,
        order_number,
        total_amount,
        payment_method,
        payment_status,
        bachs_checkout_id,
        payment_metadata,
        customer_id,
        customers (
          full_name,
          email,
          contact_number
        )
      `)
      .eq("id", orderId)
      .maybeSingle();

    if (error || !order) {
      console.error("[Checkout Pay Route] Order not found:", orderId, error);
      return NextResponse.redirect(`${siteOrigin}/cart`, { status: 303 });
    }

    if (order.payment_status === "paid") {
      return NextResponse.redirect(`${siteOrigin}/checkout/result?order_id=${encodeURIComponent(orderId)}`, {
        status: 303,
      });
    }

    const checkoutUrl = await resolveGatewayUrl(order as OrderRow, siteOrigin);
    if (checkoutUrl) {
      const response = gatewayResponse(checkoutUrl);
      if (response) return response;
    }

    return NextResponse.redirect(`${siteOrigin}/checkout/result?order_id=${encodeURIComponent(orderId)}`, {
      status: 303,
    });
  } catch (err) {
    console.error("[Checkout Pay Route Error]:", err);
    return NextResponse.redirect(`${siteOrigin}/checkout/result?order_id=${encodeURIComponent(orderId)}`, {
      status: 303,
    });
  }
}

export async function POST(request: Request) {
  if (!isSameSitePost(request)) {
    return htmlResponse(paymentErrorDocument("Checkout could not be started from this page."), 403);
  }

  let payload: unknown;
  try {
    const form = await request.formData();
    const raw = form.get("payload");
    if (typeof raw !== "string" || !raw.trim()) {
      return htmlResponse(paymentErrorDocument("Checkout details were missing. Go back and try again."), 400);
    }
    payload = JSON.parse(raw);
  } catch {
    return htmlResponse(paymentErrorDocument("Checkout details could not be read. Go back and try again."), 400);
  }

  if (!payload || typeof payload !== "object") {
    return htmlResponse(paymentErrorDocument("Checkout details were missing. Go back and try again."), 400);
  }

  const result = await submitCheckout(payload as Parameters<typeof submitCheckout>[0]);

  if (!result.ok) {
    return htmlResponse(paymentErrorDocument(result.message), 400);
  }

  if (!result.orderId || !result.checkoutUrl || !isValidPaymentGatewayUrl(result.checkoutUrl)) {
    return htmlResponse(paymentErrorDocument("Payment could not be opened. Go back and try again."), 502);
  }

  const siteOrigin = new URL(request.url).origin;
  return NextResponse.redirect(
    `${siteOrigin}/api/checkout/pay?order_id=${encodeURIComponent(result.orderId)}`,
    { status: 303 },
  );
}
