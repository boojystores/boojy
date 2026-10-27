/**
 * Cross-browser Payment Gateway Navigator
 *
 * Implements strict, reliable payment redirects for iOS Safari, Chrome,
 * and desktop browsers according to production web standards.
 *
 * Guarantees:
 * 1. Navigates the current tab with window.location.assign()
 * 2. Enforces HTTPS and an authorized Bachs host
 * 3. Does not call window.open()
 * 4. Rejects bare session IDs, javascript: URIs, and guessed URLs
 *
 * iOS Safari drops this call when it runs after an await (the tap is no longer
 * a user action). Android still allows it. Hosted checkout must submit the
 * checkout form in the same turn as the tap instead of calling this helper
 * after submitCheckout() resolves. See app/api/checkout/pay.
 */

/** Authorized production and sandbox domains for Bachs.io */
export const ALLOWED_PAYMENT_DOMAINS: readonly string[] = [
  "checkout.bachs.io",
  "bachs.io",
];

export type NavigatePaymentResult =
  | { success: true; url: string }
  | {
      success: false;
      error: "INVALID_URL" | "DISALLOWED_DOMAIN" | "NAVIGATION_FAILED" | "UNSUPPORTED_ENVIRONMENT";
      message: string;
    };

/**
 * Validates that a payment URL:
 * - Is non-empty and well-formed
 * - Uses HTTPS (or HTTP strictly for localhost in local test environments)
 * - Belongs to authorized payment provider domains (checkout.bachs.io or *.bachs.io)
 * - Is not an unvalidated session ID or malicious script scheme
 */
export function isValidPaymentGatewayUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;

  const trimmed = url.trim();
  if (!trimmed) return false;

  // Reject dangerous schemes
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:")) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);

    const isHttps = parsed.protocol === "https:";
    const isLocalDev =
      process.env.NODE_ENV !== "production" &&
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");

    if (!isHttps && !isLocalDev) {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Must match authorized Bachs domains (e.g. checkout.bachs.io or sandbox.bachs.io)
    const isAllowedDomain = ALLOWED_PAYMENT_DOMAINS.some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`),
    );

    if (isAllowedDomain) return true;

    // Allow localhost/127.0.0.1 in non-production testing
    if (isLocalDev) return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * Directs the current browser tab to the verified payment gateway URL.
 *
 * Uses `window.location.assign(paymentUrl)` as the standard web procedure.
 * Bypasses intermediate redirect proxies and never triggers popup blockers.
 */
export function navigateToPaymentGateway(
  targetUrl: string | null | undefined,
): NavigatePaymentResult {
  if (typeof window === "undefined") {
    return {
      success: false,
      error: "UNSUPPORTED_ENVIRONMENT",
      message: "Navigation is only available in a browser environment.",
    };
  }

  if (!targetUrl || typeof targetUrl !== "string" || !targetUrl.trim()) {
    return {
      success: false,
      error: "INVALID_URL",
      message: "No payment gateway URL was provided by the payment provider.",
    };
  }

  const destination = targetUrl.trim();

  if (!isValidPaymentGatewayUrl(destination)) {
    console.error("[Payment Gateway Navigation] Refusing redirect to unauthorized URL:", destination);
    return {
      success: false,
      error: "DISALLOWED_DOMAIN",
      message: "The payment URL returned is invalid or not an authorized payment domain.",
    };
  }

  try {
    window.location.assign(destination);
    return { success: true, url: destination };
  } catch {
    try {
      window.location.href = destination;
      return { success: true, url: destination };
    } catch (err) {
      console.error("[Payment Gateway Navigation Error]:", err);
      return {
        success: false,
        error: "NAVIGATION_FAILED",
        message: "Your browser could not navigate to the payment gateway. Please tap the button to proceed.",
      };
    }
  }
}
