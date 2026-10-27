/**
 * Cross-browser Payment Gateway Navigator
 *
 * Uses standard web procedures: direct top-level navigation to the external gateway URL.
 * Bypasses intermediate redirect hops and works reliably on iOS Safari, Chrome, and desktop browsers.
 */

export function navigateToPaymentGateway(
  targetUrl: string | null | undefined,
  orderId?: string | null,
): void {
  if (typeof window === "undefined") return;

  // Standard web procedure: prioritize direct navigation to the payment gateway
  const destination =
    targetUrl?.trim() ||
    (orderId ? `/api/checkout/pay?order_id=${encodeURIComponent(orderId)}` : null);

  if (!destination) return;

  try {
    window.location.href = destination;
  } catch {
    window.location.assign(destination);
  }
}
