import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import { NextRequest } from "next/server";
import { POST } from "./route";

const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}));

describe("Bachs.io Webhook API Route (/api/webhooks/bachs)", () => {
  const origEnv = process.env;
  const SECRET = "whsec_test_signing_secret_999";

  beforeEach(() => {
    process.env = { ...origEnv };
    process.env.BACHS_WEBHOOK_SECRET = SECRET;
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = origEnv;
  });

  function createSignedRequest(bodyObj: Record<string, unknown>, secret = SECRET, offsetSeconds = 0) {
    const rawBody = JSON.stringify(bodyObj);
    const timestamp = Math.floor(Date.now() / 1000) + offsetSeconds;
    const signature = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

    return new NextRequest("http://localhost:3000/api/webhooks/bachs", {
      method: "POST",
      body: rawBody,
      headers: {
        "content-type": "application/json",
        "x-bachs-timestamp": String(timestamp),
        "x-bachs-signature-v2": `t=${timestamp},v1=${signature}`,
      },
    });
  }

  it("rejects an unsigned or improperly signed request with status 400", async () => {
    const req = createSignedRequest({ id: "evt_invalid", type: "collection.succeeded" }, "wrong_key");
    const response = await POST(req);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  it("processes a valid collection.succeeded event and confirms the order atomically", async () => {
    const orderId = "00000000-0000-0000-0000-000000000001";
    const payload = {
      id: "evt_success_1",
      type: "collection.succeeded",
      created_at: new Date().toISOString(),
      organization_id: "org_1",
      data: {
        checkout_id: "chk_test_1",
        charge_id: "chg_test_1",
        reference: orderId,
        amount: "35000.00",
        currency: "NGN",
        status: "SUCCEEDED",
        metadata: {
          order_id: orderId,
          order_number: "ORD-20261024-0001",
        },
      },
    };

    // Mock DB queries:
    // 1. bachs_webhook_events lookup: no prior event
    // 2. orders lookup: returns pending order
    // 3. bachs_webhook_events insert: success
    // 4. rpc confirm_bachs_payment: returns ok: true
    // 5. bachs_webhook_events update: success
    mockFrom.mockImplementation((table: string) => {
      if (table === "bachs_webhook_events") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null }),
            }),
          }),
          insert: async () => ({ error: null }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }
      if (table === "orders") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: orderId,
                  order_number: "ORD-20261024-0001",
                  total_amount: 35000,
                  payment_status: "pending",
                  status: "pending",
                },
              }),
            }),
          }),
        };
      }
      return {};
    });

    mockRpc.mockResolvedValueOnce({
      data: {
        ok: true,
        order_id: orderId,
        order_number: "ORD-20261024-0001",
        status: "confirmed",
        payment_status: "paid",
      },
      error: null,
    });

    const req = createSignedRequest(payload);
    const response = await POST(req);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.received).toBe(true);

    expect(mockRpc).toHaveBeenCalledWith("confirm_bachs_payment", {
      p_order_id: orderId,
      p_charge_id: "chg_test_1",
      p_payment_reference: orderId,
      p_amount: 35000,
      p_currency: "NGN",
      p_metadata: payload.data,
    });
  });

  it("handles duplicate webhook events idempotently without fulfilling twice", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "bachs_webhook_events") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: "evt_duplicate", status: "processed" },
              }),
            }),
          }),
        };
      }
      return {};
    });

    const payload = {
      id: "evt_duplicate",
      type: "collection.succeeded",
      created_at: new Date().toISOString(),
      organization_id: "org_1",
      data: {
        checkout_id: "chk_test_1",
        charge_id: "chg_test_1",
        reference: "ord-1",
        amount: "35000.00",
        currency: "NGN",
      },
    };

    const req = createSignedRequest(payload);
    const response = await POST(req);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.duplicate).toBe(true);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects payment confirmation if amount or currency does not match the order", async () => {
    const orderId = "00000000-0000-0000-0000-000000000002";
    const payload = {
      id: "evt_tampered",
      type: "collection.succeeded",
      created_at: new Date().toISOString(),
      organization_id: "org_1",
      data: {
        checkout_id: "chk_test_2",
        charge_id: "chg_test_2",
        reference: orderId,
        amount: "500.00", // Tampered amount (less than expected 50,000)
        currency: "NGN",
        metadata: { order_id: orderId },
      },
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === "bachs_webhook_events") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null }),
            }),
          }),
          insert: async () => ({ error: null }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }
      if (table === "orders") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: orderId,
                  order_number: "ORD-20261024-0002",
                  total_amount: 50000,
                  payment_status: "pending",
                  status: "pending",
                },
              }),
            }),
          }),
        };
      }
      return {};
    });

    mockRpc.mockResolvedValueOnce({
      data: {
        ok: false,
        code: "AMOUNT_MISMATCH",
        message: "Expected amount 50000.00, received 500.00",
      },
      error: null,
    });

    const req = createSignedRequest(payload);
    const response = await POST(req);

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toContain("Expected amount");
  });

  it("handles checkout.expired by releasing stock and cancelling unpaid order", async () => {
    const orderId = "00000000-0000-0000-0000-000000000003";
    const payload = {
      id: "evt_expired_1",
      type: "checkout.expired",
      created_at: new Date().toISOString(),
      organization_id: "org_1",
      data: {
        checkout_id: "chk_expired_1",
        reference: orderId,
        status: "expired",
      },
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === "bachs_webhook_events") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null }),
            }),
          }),
          insert: async () => ({ error: null }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }
      if (table === "orders") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => null,
            }),
            or: () => ({
              maybeSingle: async () => ({
                data: {
                  id: orderId,
                  order_number: "ORD-20261024-0003",
                  total_amount: 25000,
                  payment_status: "pending",
                  status: "pending",
                },
              }),
            }),
          }),
        };
      }
      return {};
    });

    mockRpc.mockResolvedValueOnce({
      data: { ok: true, status: "cancelled", payment_status: "failed" },
      error: null,
    });

    const req = createSignedRequest(payload);
    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("handle_bachs_payment_failure", {
      p_order_id: orderId,
      p_reason: "Checkout session expired",
      p_restore_stock: true,
    });
  });

  it("handles collection.failed without cancelling confirmed orders", async () => {
    const orderId = "00000000-0000-0000-0000-000000000004";
    const payload = {
      id: "evt_failed_1",
      type: "collection.failed",
      created_at: new Date().toISOString(),
      organization_id: "org_1",
      data: {
        checkout_id: "chk_failed_1",
        charge_id: "chg_failed_1",
        reference: orderId,
        failure_reason: "Insufficient funds in bank account",
      },
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === "bachs_webhook_events") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null }),
            }),
          }),
          insert: async () => ({ error: null }),
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }
      if (table === "orders") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => null,
            }),
            or: () => ({
              maybeSingle: async () => ({
                data: {
                  id: orderId,
                  order_number: "ORD-20261024-0004",
                  total_amount: 18000,
                  payment_status: "pending",
                  status: "pending",
                },
              }),
            }),
          }),
        };
      }
      return {};
    });

    mockRpc.mockResolvedValueOnce({
      data: { ok: true, status: "pending", payment_status: "failed" },
      error: null,
    });

    const req = createSignedRequest(payload);
    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("handle_bachs_payment_failure", {
      p_order_id: orderId,
      p_reason: "Insufficient funds in bank account",
      p_restore_stock: false,
    });
  });
});
