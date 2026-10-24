import { Bachs, webhooks, BachsWebhookError, type CreateCheckoutSessionRequest, type CheckoutSessionCreated, type WebhookEvent } from "@bachs/sdk";

/**
 * Bachs.io Payment Gateway Client and Utilities
 *
 * Implements server-side integration for Bachs.io Checkout and Webhooks.
 * Uses official @bachs/sdk with strict security, decimal precision money handling,
 * and cryptographic webhook verification.
 */

export function getBachsApiKey(): string | null {
  return process.env.BACHS_SECRET_KEY || process.env.BACHS_API_KEY || null;
}

export function getBachsWebhookSecret(): string | null {
  return process.env.BACHS_WEBHOOK_SECRET || null;
}

export function getBachsEnvironment(): "sandbox" | "production" {
  // Auto-detect from key prefix first to prevent SDK BachsConfigError
  const key = (getBachsApiKey() || "").trim();
  if (key.startsWith("sk_live_")) return "production";
  if (key.startsWith("sk_sandbox_")) return "sandbox";

  const envVar = process.env.BACHS_ENVIRONMENT?.toLowerCase();
  if (envVar === "production" || envVar === "live") return "production";
  if (envVar === "sandbox" || envVar === "test") return "sandbox";

  return "sandbox";
}

export function isBachsConfigured(): boolean {
  return Boolean(getBachsApiKey());
}

let bachsClientInstance: Bachs | null = null;
let cachedApiKey: string | null = null;
let cachedEnv: "sandbox" | "production" | null = null;

export function getBachsClient(): Bachs {
  const apiKey = getBachsApiKey();
  if (!apiKey) {
    throw new Error(
      "Bachs.io API key is not configured. Please set BACHS_SECRET_KEY or BACHS_API_KEY in your environment variables.",
    );
  }

  const environment = getBachsEnvironment();

  // Reuse instance if already created with same key and environment
  if (!bachsClientInstance || cachedApiKey !== apiKey || cachedEnv !== environment) {
    bachsClientInstance = new Bachs({
      apiKey,
      environment,
    });
    cachedApiKey = apiKey;
    cachedEnv = environment;
  }

  return bachsClientInstance;
}

export function _resetBachsClientForTesting(): void {
  bachsClientInstance = null;
  cachedApiKey = null;
  cachedEnv = null;
}

export type CreateBachsCheckoutParams = {
  orderId: string;
  orderNumber: string;
  totalAmount: number;
  currency?: string;
  customer: {
    fullName: string;
    email: string;
    contactNumber?: string;
  };
  siteUrl: string;
};

/**
 * Creates a Bachs checkout session for an order.
 * Strictly formats amount as decimal string (e.g. "15000.00" for NGN).
 */
export async function createBachsCheckoutSession(
  params: CreateBachsCheckoutParams,
): Promise<CheckoutSessionCreated> {
  const bachs = getBachsClient();
  const currency = (params.currency || "NGN").toUpperCase();
  const amountStr = params.totalAmount.toFixed(2);

  const cleanSiteUrl = params.siteUrl.replace(/\/+$/, "");
  const successUrl = `${cleanSiteUrl}/checkout/result?order_id=${encodeURIComponent(params.orderId)}`;
  const cancelUrl = `${cleanSiteUrl}/checkout/result?order_id=${encodeURIComponent(params.orderId)}&cancelled=true`;

  const sessionRequest: CreateCheckoutSessionRequest = {
    pricing: {
      currency,
      amount: amountStr,
      price_type: "fixed",
    },
    customer: {
      email: params.customer.email.trim().toLowerCase(),
      name: params.customer.fullName.trim(),
      phone_number: params.customer.contactNumber?.trim() || null,
    },
    reference: params.orderId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      order_id: params.orderId,
      order_number: params.orderNumber,
      source: "boojy-storefront",
    },
    payment_method_types: ["NGN_CARD", "NGN_BANK_TRANSFER"],
    expires_in_minutes: 60, // 1 hour checkout expiration window
  };

  const session = await bachs.checkoutSessions.create(sessionRequest, {
    idempotencyKey: `chk_${params.orderId}`,
  });

  return session;
}

/**
 * Verifies incoming webhook request headers and payload using @bachs/sdk.
 * Enforces cryptographic HMAC-SHA256 signature verification and timestamp replay protection.
 */
export function verifyBachsWebhook(
  rawBody: string | Uint8Array,
  headers: Headers | Record<string, string | string[] | undefined>,
): WebhookEvent {
  const secret = getBachsWebhookSecret();
  if (!secret) {
    throw new Error(
      "Bachs.io webhook signing secret is not configured. Please set BACHS_WEBHOOK_SECRET in your environment variables.",
    );
  }

  // Uses official SDK constructEvent which verifies X-Bachs-Signature-V2 (and V1 fallback) with 300s replay tolerance
  return webhooks.constructEvent(rawBody, headers, secret, {
    toleranceSeconds: 300,
  });
}

export { BachsWebhookError };
