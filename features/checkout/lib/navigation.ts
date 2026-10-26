/**
 * Cross-browser Payment Gateway Navigator
 *
 * Uses the same-origin server redirect bridge (`/api/checkout/pay?order_id=...`)
 * to guarantee that iOS Safari, Mobile WebKit, and in-app browsers seamlessly load
 * the payment gateway without hitting popup blockers or user-gesture expiration.
 */

export function navigateToPaymentGateway(
  targetUrl: string | null | undefined,
  orderId?: string | null,
): void {
  if (typeof window === "undefined") return;

  // Prefer the same-origin server redirect bridge if orderId is provided
  // Same-origin navigation is NEVER blocked or discarded by iOS Safari
  const destination = orderId
    ? `/api/checkout/pay?order_id=${encodeURIComponent(orderId)}`
    : targetUrl?.trim();

  if (!destination) return;

  try {
    window.location.assign(destination);
  } catch {
    window.location.href = destination;
  }
}
