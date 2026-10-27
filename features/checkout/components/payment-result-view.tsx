"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  XCircle,
  ArrowRight,
  RotateCcw,
  ShoppingBag,
  ShieldCheck,
  Loader2,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BoojyPreloader } from "@/components/boojy-preloader";
import { priceFormatter } from "@/lib/currency";
import { downloadReceipt } from "@/features/tracking/lib/download-receipt";
import type { PaymentMethod } from "@/features/checkout/lib/checkout";
import { useCartStore } from "@/features/cart/lib/cart";
import {
  getOrderPaymentStatus,
  type OrderPaymentStatusResult,
} from "@/features/checkout/actions";

interface PaymentResultViewProps {
  orderId: string;
  isCancelled?: boolean;
}

export function PaymentResultView({ orderId, isCancelled }: PaymentResultViewProps) {
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [orderData, setOrderData] = useState<OrderPaymentStatusResult | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!orderId) {
      setLoading(false);
      return;
    }

    try {
      const res = await getOrderPaymentStatus(orderId);
      setOrderData(res);
      setLoading(false);
      return res;
    } catch (err) {
      console.error("Failed to fetch order status:", err);
      setLoading(false);
      return null;
    }
  }, [orderId]);

  // Initial fetch and polling if pending
  useEffect(() => {
    let isMounted = true;

    async function check() {
      const res = await fetchStatus();
      if (!isMounted) return;

      if (res?.ok && (res.paymentStatus === "paid" || res.status === "confirmed")) {
        useCartStore.getState().clearCart();
      }

      // If pending and not explicitly cancelled, poll for up to 30 seconds (12 checks @ 2.5s)
      if (res?.ok && res.paymentStatus === "pending" && !isCancelled && pollCount < 12) {
        pollTimerRef.current = setTimeout(() => {
          if (isMounted) {
            setPollCount((prev) => prev + 1);
          }
        }, 2500);
      }
    }

    check();

    return () => {
      isMounted = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [fetchStatus, pollCount, isCancelled]);

  useEffect(() => {
    if (orderData && (orderData.paymentStatus === "paid" || orderData.status === "confirmed")) {
      useCartStore.getState().clearCart();
    }
  }, [orderData]);

  async function handleDownloadReceipt() {
    if (!orderData?.orderNumber) return;
    setDownloading(true);
    try {
      await downloadReceipt({
        orderNumber: orderData.orderNumber,
        totalAmount: orderData.totalAmount || 0,
        paymentMethod: (orderData.paymentMethod || "bachs") as PaymentMethod,
        deliveryAddress: orderData.deliveryAddress || "",
        customerName: orderData.customerName || "Valued Customer",
        createdAt: orderData.paidAt || orderData.createdAt || undefined,
        shippingFee: orderData.shippingFee,
        shippingMethodName: orderData.shippingMethodName,
        items: orderData.items || [],
      });
    } catch (err) {
      console.error("Failed to generate receipt PDF:", err);
      alert("Could not generate receipt. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <div className="site-container flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
        <BoojyPreloader size="lg" />
      </div>
    );
  }

  if (!orderData || !orderData.ok) {
    return (
      <div className="site-container flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <XCircle className="h-8 w-8" />
        </div>
        <h1 className="mt-6 text-2xl font-bold tracking-tight text-foreground">
          Order Not Found
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          {orderData?.message || "We could not find the order reference associated with this transaction."}
        </p>
        <div className="mt-8">
          <Button asChild>
            <Link href="/">Return to Storefront</Link>
          </Button>
        </div>
      </div>
    );
  }

  const isPaid = orderData.paymentStatus === "paid" || orderData.status === "confirmed";
  const isFailed = isCancelled || orderData.paymentStatus === "failed" || orderData.status === "cancelled";
  const isPending = !isPaid && !isFailed;
  const payHref = `/api/checkout/pay?order_id=${encodeURIComponent(orderId)}`;

  return (
    <div className="site-container py-12 md:py-20">
      <div className="mx-auto max-w-xl rounded-2xl border border-border/50 bg-card/10 backdrop-blur-sm p-6 shadow-xl sm:p-10">
        {/* Paid / Confirmed State */}
        {isPaid && (
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center text-foreground">
              <BadgeCheck className="h-16 w-16 stroke-[1.6]" />
            </div>

            <span className="mt-4 inline-block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Payment Verified
            </span>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Thank You for Your Order!
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your payment has been successfully processed and verified.
            </p>

            <div className="mt-8 rounded-xl border border-border/80 bg-muted/40 p-5 text-left text-sm">
              <div className="flex justify-between border-b border-border/60 pb-3">
                <span className="text-muted-foreground">Order Reference</span>
                <span className="font-mono font-bold text-foreground">
                  {orderData.orderNumber}
                </span>
              </div>
              <div className="flex justify-between border-b border-border/60 py-3">
                <span className="text-muted-foreground">Amount Paid</span>
                <span className="font-semibold text-foreground">
                  {priceFormatter.format(orderData.totalAmount || 0)}
                </span>
              </div>
              <div className="flex justify-between border-b border-border/60 py-3">
                <span className="text-muted-foreground">Payment Method</span>
                <span className="font-medium text-foreground">Card & Bank Transfer</span>
              </div>
              {orderData.deliveryAddress ? (
                <div className="flex justify-between border-b border-border/60 py-3">
                  <span className="text-muted-foreground">Delivery To</span>
                  <span className="max-w-[240px] truncate text-right font-medium text-foreground">
                    {orderData.deliveryAddress}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between pt-3">
                <span className="text-muted-foreground">Status</span>
                <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="h-4 w-4" /> Paid & Confirmed
                </span>
              </div>

              {orderData.items && orderData.items.length > 0 && (
                <div className="mt-4 border-t border-border/60 pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Purchased Pieces
                  </p>
                  <ul className="space-y-1.5">
                    {orderData.items.map((item, idx) => {
                      const sizeMatch = item.name.match(/\(Size:\s*([^)]+)\)/i)?.[1];
                      return (
                        <li key={idx} className="flex justify-between text-xs">
                          <span className="min-w-0 truncate text-foreground flex items-center gap-1.5">
                            <span className="truncate">{item.name}</span>
                            {sizeMatch && (
                              <span className="shrink-0 rounded bg-neutral-900 px-1.5 py-0.2 text-[10px] font-bold uppercase text-white dark:bg-white dark:text-black">
                                {sizeMatch}
                              </span>
                            )}
                            <span className="text-muted-foreground shrink-0">× {item.quantity}</span>
                          </span>
                          <span className="shrink-0 font-medium tabular-nums text-foreground">
                            {priceFormatter.format(item.unitPrice * item.quantity)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            <div className="mt-8 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  size="lg"
                  onClick={handleDownloadReceipt}
                  disabled={downloading}
                  className="w-full"
                >
                  {downloading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating Receipt…
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" /> Download Receipt
                    </>
                  )}
                </Button>
                {orderData.orderNumber && orderData.customerEmail ? (
                  <Button asChild variant="outline" size="lg" className="w-full">
                    <Link
                      href={`/track?order=${encodeURIComponent(orderData.orderNumber)}&email=${encodeURIComponent(orderData.customerEmail)}`}
                    >
                      Track Order <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Link>
                  </Button>
                ) : null}
              </div>

              <Button asChild variant="ghost" size="lg" className="w-full text-muted-foreground hover:text-foreground">
                <Link href="/">
                  <ShoppingBag className="mr-1.5 h-4 w-4" /> Continue Shopping
                </Link>
              </Button>
            </div>
          </div>
        )}

        {/* Failed or Cancelled State */}
        {isFailed && (
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 ring-8 ring-amber-500/5">
              <XCircle className="h-9 w-9" />
            </div>

            <span className="mt-5 inline-block text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
              {isCancelled ? "Checkout Cancelled" : "Payment Unsuccessful"}
            </span>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {isCancelled ? "Payment was Cancelled" : "Payment Incomplete"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {isCancelled
                ? "You cancelled the checkout session before completion. Your card was not charged."
                : "The payment attempt could not be confirmed by your bank or provider."}
            </p>

            <div className="mt-8 rounded-xl border border-border/80 bg-muted/40 p-5 text-left text-sm">
              <div className="flex justify-between border-b border-border/60 pb-3">
                <span className="text-muted-foreground">Order Reference</span>
                <span className="font-mono font-medium text-foreground">
                  {orderData.orderNumber}
                </span>
              </div>
              <div className="flex justify-between pt-3">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold text-foreground">
                  {priceFormatter.format(orderData.totalAmount || 0)}
                </span>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button asChild className="w-full sm:w-auto">
                <a href={payHref}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Retry Payment
                </a>
              </Button>
              <Button asChild variant="outline" className="w-full sm:w-auto">
                <Link href="/checkout">Return to Cart</Link>
              </Button>
            </div>
          </div>
        )}

        {/* Pending / In-Flight Verification State */}
        {isPending && (
          <div className="text-center">
            <div className="mb-6 flex justify-center">
              <BoojyPreloader size="md" />
            </div>

            <span className="inline-block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Payment Awaiting Confirmation
            </span>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Processing Payment
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We are checking for your payment confirmation. If you haven't completed your payment yet, tap below to continue.
            </p>

            <div className="mt-8 rounded-xl border border-border/80 bg-muted/40 p-5 text-left text-sm">
              <div className="flex justify-between border-b border-border/60 pb-3">
                <span className="text-muted-foreground">Order Reference</span>
                <span className="font-mono font-semibold text-foreground">
                  {orderData.orderNumber}
                </span>
              </div>
              <div className="flex justify-between pt-3">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold text-foreground">
                  {priceFormatter.format(orderData.totalAmount || 0)}
                </span>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button asChild size="lg" className="w-full sm:w-auto font-display uppercase tracking-wider">
                <a href={payHref}>
                  Continue to Payment <ArrowRight className="ml-1.5 h-4 w-4" />
                </a>
              </Button>
              <Button
                onClick={() => {
                  setLoading(true);
                  fetchStatus();
                }}
                variant="outline"
                size="lg"
                className="w-full sm:w-auto font-display uppercase tracking-wider"
              >
                <RotateCcw className="mr-2 h-4 w-4" /> Refresh Status
              </Button>
              <Button asChild variant="ghost" size="lg" className="w-full sm:w-auto">
                <Link href="/">Back to Storefront</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
