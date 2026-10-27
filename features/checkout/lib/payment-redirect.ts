import { isValidPaymentGatewayUrl } from "@/features/checkout/lib/navigation";

/** Must match the Zustand persist `name` in features/cart/lib/cart.ts */
const CART_STORAGE_KEY = "boojy-cart";

/**
 * iOS Safari only follows a cross-origin payment redirect when the navigation
 * started as a real user action (form POST or link tap). A `location.assign`
 * that runs after `await submitCheckout()` is dropped on iOS and still runs
 * on Android, because Android keeps the tap "live" for longer.
 *
 * The handoff document is what `/api/checkout/pay` returns after that
 * user-initiated request. Meta refresh plus `location.replace` run while the
 * document is parsing, so WebKit follows them onto the payment gateway, and
 * the link is there if the automatic hop does not.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Rejects URLs that are valid gateway URLs but unsafe to embed in HTML. */
function isEmbeddableGatewayUrl(url: string): boolean {
  return isValidPaymentGatewayUrl(url) && !/[\s"'<>\\]/.test(url);
}

/**
 * Full HTML document that sends the current tab to the payment gateway.
 * Returns null when the URL is missing or not an authorized gateway URL.
 */
export function paymentGatewayDocument(checkoutUrl: string | null | undefined): string | null {
  if (!checkoutUrl || !isEmbeddableGatewayUrl(checkoutUrl)) return null;

  const href = escapeHtml(checkoutUrl);
  const scriptUrl = JSON.stringify(checkoutUrl).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Opening payment</title>
<meta http-equiv="refresh" content="0;url=${href}">
<style>
  body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #fff; color: #111; }
  main { text-align: center; padding: 24px; }
  a { display: inline-block; margin-top: 16px; background: #111; color: #fff; text-decoration: none; padding: 16px 24px; border-radius: 12px; font-weight: 700; }
</style>
</head>
<body>
<main>
  <p>Opening secure payment…</p>
  <a href="${href}" target="_blank" rel="noopener noreferrer">Continue to payment</a>
</main>
<script>
try { localStorage.removeItem(${JSON.stringify(CART_STORAGE_KEY)}); } catch (e) {}
location.replace(${scriptUrl});
</script>
</body>
</html>`;
}

/** Same-origin page shown when checkout cannot start a payment session. */
export function paymentErrorDocument(message: string): string {
  const safe = escapeHtml(message || "Payment could not be opened. Go back and try again.");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Payment not opened</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #fff; color: #111; }
  main { text-align: center; max-width: 28rem; padding: 24px; }
  a { display: inline-block; margin-top: 16px; color: #111; font-weight: 700; }
</style>
</head>
<body>
<main>
  <p>${safe}</p>
  <a href="/checkout">Back to checkout</a>
</main>
</body>
</html>`;
}
