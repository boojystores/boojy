"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  RotateCcw,
  ShoppingBag,
  ShieldCheck,
  Loader2,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { priceFormatter } from "@/lib/currency";
import { downloadReceipt } from "@/features/tracking/lib/download-receipt";
import type { PaymentMethod } from "@/features/checkout/lib/checkout";
import {
  getOrderPaymentStatus,
  retryBachsPayment,
  type OrderPaymentStatusResult,
} from "@/features/checkout/actions";

interface PaymentResultViewProps {
  orderId: string;
  isCancelled?: boolean;
}

export function PaymentResultView({ orderId, isCancelled }: PaymentResultViewProps) {
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
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
        items: orderData.items || [],
      });
    } catch (err) {
      console.error("Failed to generate receipt PDF:", err);
      alert("Could not generate receipt. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleRetry() {
    if (!orderId || retrying) return;
    setRetrying(true);
    try {
      const res = await retryBachsPayment(orderId);
      if (res.ok && res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      } else {
        alert(res.message || "Failed to restart payment session.");
        setRetrying(false);
      }
    } catch {
      alert("An unexpected error occurred. Please try again.");
      setRetrying(false);
    }
  }

  if (loading) {
    return (
      <div className="site-container flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <div className="absolute h-full w-full animate-ping rounded-full bg-primary/20" />
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
        <h2 className="mt-6 text-xl font-semibold tracking-tight text-foreground">
          Confirming Payment...
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Securing cryptographic verification with Bachs.io. Please do not refresh.
        </p>
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

  return (
    <div className="site-container py-12 md:py-20">
      <div className="mx-auto max-w-xl rounded-2xl border border-border/50 bg-card/10 backdrop-blur-sm p-6 shadow-xl sm:p-10">
        {/* Paid / Confirmed State */}
        {isPaid && (
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 ring-8 ring-emerald-500/5">
              <CheckCircle2 className="h-9 w-9" />
            </div>

            <span className="mt-5 inline-block text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Payment Verified
            </span>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Thank You for Your Order!
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your payment has been successfully processed and verified by Bachs.io.
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
                <span className="text-muted-foreground">Payment Gateway</span>
                <span className="font-medium text-foreground">Bachs.io Secure Checkout</span>
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
                    {orderData.items.map((item, idx) => (
                      <li key={idx} className="flex justify-between text-xs">
                        <span className="min-w-0 truncate text-foreground">
                          {item.name} <span className="text-muted-foreground">× {item.quantity}</span>
                        </span>
                        <span className="shrink-0 font-medium tabular-nums text-foreground">
                          {priceFormatter.format(item.unitPrice * item.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button
                type="button"
                size="lg"
                onClick={handleDownloadReceipt}
                disabled={downloading}
                className="w-full sm:w-auto"
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
                <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                  <Link
                    href={`/track?order=${encodeURIComponent(orderData.orderNumber)}&email=${encodeURIComponent(orderData.customerEmail)}`}
                  >
                    Track Order <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="ghost" size="lg" className="w-full sm:w-auto">
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
              <Button
                onClick={handleRetry}
                disabled={retrying}
                className="w-full sm:w-auto"
              >
                {retrying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing Checkout...
                  </>
                ) : (
                  <>
                    <RotateCcw className="mr-2 h-4 w-4" /> Retry Payment
                  </>
                )}
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
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-500/10 text-blue-500 ring-8 ring-blue-500/5">
              <Clock className="h-9 w-9 animate-pulse" />
            </div>

            <span className="mt-5 inline-block text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Payment Awaiting Confirmation
            </span>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Processing Payment
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We have received your request and are awaiting final webhook confirmation from Bachs.io.
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
              <Button
                onClick={() => {
                  setLoading(true);
                  fetchStatus();
                }}
                variant="outline"
                className="w-full sm:w-auto"
              >
                <RotateCcw className="mr-2 h-4 w-4" /> Refresh Status
              </Button>
              <Button asChild variant="default" className="w-full sm:w-auto">
                <Link href="/">Back to Storefront</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
