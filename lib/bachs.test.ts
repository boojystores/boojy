import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import {
  getBachsApiKey,
  getBachsWebhookSecret,
  getBachsEnvironment,
  isBachsConfigured,
  getBachsClient,
  _resetBachsClientForTesting,
  createBachsCheckoutSession,
  verifyBachsWebhook,
  BachsWebhookError,
} from "./bachs";

describe("Bachs.io Client & Configuration", () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
    delete process.env.BACHS_SECRET_KEY;
    delete process.env.BACHS_API_KEY;
    delete process.env.BACHS_WEBHOOK_SECRET;
    delete process.env.BACHS_ENVIRONMENT;
    _resetBachsClientForTesting();
  });

  afterEach(() => {
    process.env = origEnv;
    _resetBachsClientForTesting();
  });

  it("detects when Bachs credentials are not configured", () => {
    expect(isBachsConfigured()).toBe(false);
    expect(getBachsApiKey()).toBeNull();
    expect(getBachsWebhookSecret()).toBeNull();
    expect(() => getBachsClient()).toThrow(/Bachs.io API key is not configured/);
  });

  it("reads API key from BACHS_SECRET_KEY or fallback BACHS_API_KEY", () => {
    process.env.BACHS_SECRET_KEY = "sk_sandbox_test_123";
    expect(isBachsConfigured()).toBe(true);
    expect(getBachsApiKey()).toBe("sk_sandbox_test_123");

    delete process.env.BACHS_SECRET_KEY;
    process.env.BACHS_API_KEY = "sk_live_test_456";
    expect(getBachsApiKey()).toBe("sk_live_test_456");
  });

  it("auto-detects environment from key prefix with precedence to avoid SDK conflicts", () => {
    // sk_sandbox_ prefix always forces sandbox
    process.env.BACHS_SECRET_KEY = "sk_sandbox_abc";
    expect(getBachsEnvironment()).toBe("sandbox");

    // sk_live_ prefix always forces production even if BACHS_ENVIRONMENT is sandbox
    process.env.BACHS_SECRET_KEY = "sk_live_abc";
    process.env.BACHS_ENVIRONMENT = "sandbox";
    expect(getBachsEnvironment()).toBe("production");

    // When key has no prefix, explicit BACHS_ENVIRONMENT is used
    process.env.BACHS_SECRET_KEY = "custom_key_without_prefix";
    process.env.BACHS_ENVIRONMENT = "production";
    expect(getBachsEnvironment()).toBe("production");

    process.env.BACHS_ENVIRONMENT = "sandbox";
    expect(getBachsEnvironment()).toBe("sandbox");
  });
});

describe("Bachs.io Checkout Session Creation", () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.BACHS_SECRET_KEY = "sk_sandbox_dummy_key_12345";
  });

  afterEach(() => {
    process.env = origEnv;
    vi.restoreAllMocks();
  });

  it("formats decimal amounts, customer details, and unique references accurately", async () => {
    const client = getBachsClient();
    const createMock = vi.spyOn(client.checkoutSessions, "create").mockResolvedValueOnce({
      checkout_id: "chk_test_999",
      checkout_url: "https://checkout.bachs.io/c/chk_test_999",
      status: "open",
      expires_at: "2026-10-25T00:00:00Z",
      created_at: "2026-10-24T23:00:00Z",
      reference: "ord-uuid-1",
    });

    const session = await createBachsCheckoutSession({
      orderId: "ord-uuid-1",
      orderNumber: "ORD-20261024-0001",
      totalAmount: 45000, // 45,000 NGN
      currency: "NGN",
      customer: {
        fullName: "Amaka Eze",
        email: "amaka@example.com",
        contactNumber: "+2348012345678",
      },
      siteUrl: "https://boojy.store",
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    const [payload, options] = createMock.mock.calls[0];

    // Money amount must be a decimal string at currency precision, NEVER cents
    expect(payload.pricing).toEqual({
      currency: "NGN",
      amount: "45000.00",
      price_type: "fixed",
    });
    expect(payload.customer).toEqual({
      name: "Amaka Eze",
      email: "amaka@example.com",
      phone_number: "+2348012345678",
    });
    expect(payload.reference).toBe("ord-uuid-1");
    expect(payload.success_url).toBe("https://boojy.store/checkout/result?order_id=ord-uuid-1");
    expect(payload.cancel_url).toBe("https://boojy.store/checkout/result?order_id=ord-uuid-1&cancelled=true");
    expect(payload.payment_method_types).toEqual(["NGN_CARD", "NGN_BANK_TRANSFER"]);
    expect(payload.metadata).toEqual({
      order_id: "ord-uuid-1",
      order_number: "ORD-20261024-0001",
      source: "boojy-storefront",
    });

    // Idempotency key matches order
    expect(options?.idempotencyKey).toBe("chk_ord-uuid-1");
    expect(session.checkout_url).toBe("https://checkout.bachs.io/c/chk_test_999");
  });

  it("handles provider timeout or network error cleanly", async () => {
    const client = getBachsClient();
    vi.spyOn(client.checkoutSessions, "create").mockRejectedValueOnce(
      new Error("Gateway timeout connecting to Bachs.io"),
    );

    await expect(
      createBachsCheckoutSession({
        orderId: "ord-uuid-2",
        orderNumber: "ORD-20261024-0002",
        totalAmount: 12000,
        customer: { fullName: "Kofi Mensah", email: "kofi@example.com" },
        siteUrl: "http://localhost:3000",
      }),
    ).rejects.toThrow("Gateway timeout connecting to Bachs.io");
  });
});

describe("Bachs.io Webhook Signature Verification", () => {
  const origEnv = process.env;
  const SECRET = "whsec_super_secret_signing_key_456";

  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.BACHS_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    process.env = origEnv;
  });

  function signPayload(body: string, timestamp: number, secret: string) {
    const signature = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${body}`)
      .digest("hex");
    return {
      "x-bachs-timestamp": String(timestamp),
      "x-bachs-signature-v2": `t=${timestamp},v1=${signature}`,
      "x-bachs-signature": signature,
    };
  }

  it("successfully verifies a genuine webhook payload with valid timestamp and signature", () => {
    const payload = JSON.stringify({
      id: "evt_test_1001",
      type: "collection.succeeded",
      created_at: new Date().toISOString(),
      organization_id: "org_1",
      data: {
        checkout_id: "chk_101",
        charge_id: "chg_202",
        reference: "ord-1",
        amount: "50000.00",
        currency: "NGN",
      },
    });

    const now = Math.floor(Date.now() / 1000);
    const headers = signPayload(payload, now, SECRET);

    const event = verifyBachsWebhook(payload, headers);
    expect(event.id).toBe("evt_test_1001");
    expect(event.type).toBe("collection.succeeded");
    expect((event.data as Record<string, unknown>).amount).toBe("50000.00");
  });

  it("rejects an invalid signature", () => {
    const payload = JSON.stringify({ id: "evt_fake", type: "collection.succeeded" });
    const now = Math.floor(Date.now() / 1000);
    const headers = signPayload(payload, now, "wrong_secret");

    expect(() => verifyBachsWebhook(payload, headers)).toThrow(BachsWebhookError);
  });

  it("rejects a stale timestamp to prevent replay attacks", () => {
    const payload = JSON.stringify({ id: "evt_stale", type: "collection.succeeded" });
    // Timestamp 600 seconds ago (exceeds 300s tolerance)
    const staleTime = Math.floor(Date.now() / 1000) - 600;
    const headers = signPayload(payload, staleTime, SECRET);

    expect(() => verifyBachsWebhook(payload, headers)).toThrow(/stale|expired|tolerance/i);
  });

  it("fails safely when BACHS_WEBHOOK_SECRET is not configured", () => {
    delete process.env.BACHS_WEBHOOK_SECRET;
    const payload = "{}";
    expect(() => verifyBachsWebhook(payload, {})).toThrow(/signing secret is not configured/);
  });
});
