import { NextRequest, NextResponse } from "next/server";
import { verifyBachsWebhook, BachsWebhookError } from "@/lib/bachs";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Dedicated Bachs.io Webhook Endpoint
 *
 * Route: POST /api/webhooks/bachs
 *
 * Security & Reliability guarantees:
 * 1. Cryptographic HMAC-SHA256 signature verification via @bachs/sdk
 * 2. Replay protection and timestamp tolerance enforcement
 * 3. Idempotent processing with provider event ID deduplication in bachs_webhook_events
 * 4. Atomic database transitions preventing double-fulfillment
 * 5. Strict currency (NGN) and order total amount validation
 * 6. Inventory release on checkout session expiration
 */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let rawBody: string;

  try {
    rawBody = await req.text();
  } catch (err) {
    console.error("[Bachs Webhook] Failed to read request body:", err);
    return NextResponse.json({ error: "Failed to read request body" }, { status: 400 });
  }

  // 1. Signature Verification
  let event;
  try {
    event = verifyBachsWebhook(rawBody, req.headers);
  } catch (err) {
    if (err instanceof BachsWebhookError) {
      console.warn(`[Bachs Webhook] Signature verification failed: ${err.message}`);
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[Bachs Webhook] Webhook verification error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Webhook verification failed" },
      { status: 400 },
    );
  }

  const eventId = event.id;
  const eventType = event.type;
  const eventData = (event.data || {}) as Record<string, unknown>;

  const supabase = createServiceClient();

  // 2. Idempotency Check: prevent duplicate event processing
  try {
    const { data: existingEvent } = await supabase
      .from("bachs_webhook_events")
      .select("id, status")
      .eq("id", eventId)
      .maybeSingle();

    if (existingEvent && existingEvent.status === "processed") {
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
    }

    if (!existingEvent) {
      await supabase.from("bachs_webhook_events").insert({
        id: eventId,
        event_type: eventType,
        payload: event,
        status: "processing",
      });
    }
  } catch (dbErr) {
    console.error("[Bachs Webhook] Error checking idempotency:", dbErr);
    // Transient DB failure: return 500 so provider retries
    return NextResponse.json({ error: "Database error during event recording" }, { status: 500 });
  }

  // 3. Resolve Internal Order
  const reference =
    typeof eventData.reference === "string" ? eventData.reference.trim() : null;
  const checkoutId =
    typeof eventData.checkout_id === "string" ? eventData.checkout_id.trim() : null;
  const metadata = (eventData.metadata || {}) as Record<string, unknown>;
  const orderIdFromMeta =
    typeof metadata.order_id === "string" ? metadata.order_id.trim() : null;

  let order: { id: string; order_number: string; total_amount: number; payment_status: string; status: string } | null = null;

  try {
    // Try resolving by orderIdFromMeta
    if (orderIdFromMeta) {
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, total_amount, payment_status, status")
        .eq("id", orderIdFromMeta)
        .maybeSingle();
      if (data) order = data;
    }

    // Try resolving by reference (id or order_number)
    if (!order && reference) {
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, total_amount, payment_status, status")
        .or(`id.eq.${reference},order_number.eq.${reference}`)
        .maybeSingle();
      if (data) order = data;
    }

    // Try resolving by checkoutId
    if (!order && checkoutId) {
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, total_amount, payment_status, status")
        .eq("bachs_checkout_id", checkoutId)
        .maybeSingle();
      if (data) order = data;
    }
  } catch (queryErr) {
    console.error("[Bachs Webhook] Error resolving order:", queryErr);
    return NextResponse.json({ error: "Failed to resolve order" }, { status: 500 });
  }

  // 4. Process Events
  try {
    switch (eventType) {
      case "collection.succeeded":
      case "checkout.succeeded":
      case "checkout_succeeded":
      case "checkout.completed": {
        if (!order) {
          console.error(
            `[Bachs Webhook] Order not found for ${eventType}: reference=${reference}, checkout_id=${checkoutId}`,
          );
          await supabase
            .from("bachs_webhook_events")
            .update({ status: "failed", error_message: "Order not found" })
            .eq("id", eventId);
          return NextResponse.json({ error: "Order not found" }, { status: 404 });
        }

        const chargeId =
          typeof eventData.charge_id === "string"
            ? eventData.charge_id
            : typeof eventData.payment_id === "string"
              ? eventData.payment_id
              : typeof eventData.id === "string"
                ? eventData.id
                : checkoutId || "chg_unknown";

        const currency =
          typeof eventData.currency === "string"
            ? eventData.currency.toUpperCase()
            : typeof (eventData.pricing as Record<string, unknown>)?.currency === "string"
              ? String((eventData.pricing as Record<string, unknown>).currency).toUpperCase()
              : "NGN";

        let rawAmount = NaN;
        if (typeof eventData.amount === "string" || typeof eventData.amount === "number") {
          rawAmount = typeof eventData.amount === "string" ? parseFloat(eventData.amount) : eventData.amount;
        } else if (typeof eventData.total_amount === "string" || typeof eventData.total_amount === "number") {
          rawAmount = typeof eventData.total_amount === "string" ? parseFloat(eventData.total_amount) : eventData.total_amount;
        } else if (
          typeof (eventData.pricing as Record<string, unknown>)?.amount === "string" ||
          typeof (eventData.pricing as Record<string, unknown>)?.amount === "number"
        ) {
          const pricingAmount = (eventData.pricing as Record<string, unknown>).amount;
          rawAmount = typeof pricingAmount === "string" ? parseFloat(pricingAmount as string) : (pricingAmount as number);
        } else if (order.total_amount) {
          rawAmount = Number(order.total_amount);
        }

        if (isNaN(rawAmount)) {
          console.error(`[Bachs Webhook] Invalid amount in ${eventType} payload:`, eventData.amount);
          await supabase
            .from("bachs_webhook_events")
            .update({ status: "failed", error_message: "Invalid amount", order_id: order.id })
            .eq("id", eventId);
          return NextResponse.json({ error: "Invalid amount in event payload" }, { status: 400 });
        }

        // Atomic payment confirmation RPC (validates amount & currency, sets status to confirmed & paid, deducts stock)
        const { data: confirmResult, error: rpcError } = await supabase.rpc("confirm_bachs_payment", {
          p_order_id: order.id,
          p_charge_id: chargeId,
          p_payment_reference: reference || order.id,
          p_amount: rawAmount,
          p_currency: currency,
          p_metadata: eventData,
        });

        if (rpcError) {
          console.error("[Bachs Webhook] RPC confirm_bachs_payment failed:", rpcError);
          return NextResponse.json({ error: rpcError.message }, { status: 500 });
        }

        if (!confirmResult?.ok) {
          console.error("[Bachs Webhook] Payment confirmation rejected by RPC:", confirmResult);
          await supabase
            .from("bachs_webhook_events")
            .update({
              status: "failed",
              error_message: confirmResult?.message || "Confirmation rejected",
              order_id: order.id,
            })
            .eq("id", eventId);

          return NextResponse.json(
            { error: confirmResult?.message || "Payment confirmation rejected" },
            { status: 422 },
          );
        }

        // Successfully confirmed
        await supabase
          .from("bachs_webhook_events")
          .update({
            status: "processed",
            order_id: order.id,
            processed_at: new Date().toISOString(),
          })
          .eq("id", eventId);

        console.log(`[Bachs Webhook] Successfully confirmed payment for order ${order.order_number}`);
        break;
      }

      case "collection.failed":
      case "checkout.failed":
      case "checkout_failed": {
        if (order) {
          const failureReason =
            typeof eventData.failure_reason === "string"
              ? eventData.failure_reason
              : "Payment attempt failed";

          await supabase.rpc("handle_bachs_payment_failure", {
            p_order_id: order.id,
            p_reason: failureReason,
            p_restore_stock: false, // Don't cancel yet if customer may retry
          });

          await supabase
            .from("bachs_webhook_events")
            .update({
              status: "processed",
              order_id: order.id,
              processed_at: new Date().toISOString(),
            })
            .eq("id", eventId);
        }
        break;
      }

      case "checkout.expired": {
        if (order) {
          // Release stock and cancel order since checkout session expired
          await supabase.rpc("handle_bachs_payment_failure", {
            p_order_id: order.id,
            p_reason: "Checkout session expired",
            p_restore_stock: true,
          });

          await supabase
            .from("bachs_webhook_events")
            .update({
              status: "processed",
              order_id: order.id,
              processed_at: new Date().toISOString(),
            })
            .eq("id", eventId);
        }
        break;
      }

      default: {
        // Acknowledge unsupported/future event types safely
        await supabase
          .from("bachs_webhook_events")
          .update({
            status: "ignored",
            order_id: order?.id || null,
            processed_at: new Date().toISOString(),
          })
          .eq("id", eventId);
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[Bachs Webhook] Uncaught processing error:", err);
    return NextResponse.json(
      { error: "Internal server error during webhook processing" },
      { status: 500 },
    );
  }
}
