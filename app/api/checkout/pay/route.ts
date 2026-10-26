import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getBachsClient, createBachsCheckoutSession, isBachsConfigured } from "@/lib/bachs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Server-Side Payment Gateway Redirect Bridge
 *
 * Resolves iOS Safari, Mobile WebKit, and in-app browser redirect suppression.
 *
 * Why this works:
 * Programmatic client-side cross-origin redirects (`window.location.href = externalUrl`)
 * are frequently blocked by WebKit on mobile devices after an asynchronous operation.
 * By navigating the browser to this same-origin endpoint first, the server responds
 * with an authoritative HTTP 303 See Other header, which Mobile Safari's native
 * network stack always follows without triggering popup blockers.
 */
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

    // If order is already paid, redirect straight to result verification
    if (order.payment_status === "paid") {
      return NextResponse.redirect(`${siteOrigin}/checkout/result?order_id=${encodeURIComponent(orderId)}`, {
        status: 303,
      });
    }

    const metadata = (order.payment_metadata as Record<string, any>) || {};

    // 1. Check if we already have a valid checkout_url saved in payment_metadata
    if (metadata.checkout_url && typeof metadata.checkout_url === "string") {
      return NextResponse.redirect(metadata.checkout_url, { status: 303 });
    }

    // 2. If we have a bachs_checkout_id, query Bachs for the session's checkout_url
    if (order.bachs_checkout_id && isBachsConfigured()) {
      try {
        const bachs = getBachsClient();
        const session = (await bachs.checkoutSessions.get(order.bachs_checkout_id)) as { checkout_url?: string };
        if (session.checkout_url && typeof session.checkout_url === "string") {
          // Cache in order metadata for subsequent visits
          await serviceClient
            .from("orders")
            .update({
              payment_metadata: { ...metadata, checkout_url: session.checkout_url },
            })
            .eq("id", orderId);

          return NextResponse.redirect(session.checkout_url, { status: 303 });
        }
      } catch (sessionErr) {
        console.warn("[Checkout Pay Route] Failed to get existing Bachs session:", sessionErr);
      }
    }

    // 3. Otherwise, create a fresh Bachs checkout session
    if (isBachsConfigured()) {
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

      return NextResponse.redirect(session.checkout_url, { status: 303 });
    }

    // Fallback if Bachs not configured: send to result page
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
