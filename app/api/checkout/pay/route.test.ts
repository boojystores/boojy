import { describe, it, expect, vi } from "vitest";
import { GET, POST } from "./route";
import { submitCheckout } from "@/features/checkout/actions";

// Mock Supabase service client
const mockOrder = {
  id: "ord-test-123",
  order_number: "ORD-20261026-0001",
  total_amount: 5000,
  payment_method: "bachs",
  payment_status: "pending",
  bachs_checkout_id: "chk_test_123",
  payment_metadata: { checkout_url: "https://checkout.bachs.io/c/chk_test_123" },
  customer_id: "cust-1",
  customers: {
    full_name: "Test Customer",
    email: "test@example.com",
    phone: "08012345678",
  },
};

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: mockOrder,
            error: null,
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(async () => ({ error: null })),
      })),
    })),
  })),
}));

vi.mock("@/features/checkout/actions", () => ({
  submitCheckout: vi.fn(),
}));

vi.mock("@/lib/bachs", () => ({
  isBachsConfigured: vi.fn(() => true),
  getBachsClient: vi.fn(),
  createBachsCheckoutSession: vi.fn(async () => ({
    checkout_id: "chk_test_new",
    checkout_url: "https://checkout.bachs.io/c/chk_test_new",
  })),
}));

describe("GET /api/checkout/pay", () => {
  it("redirects to cart if order_id is missing", async () => {
    const req = new Request("https://boojy.store/api/checkout/pay");
    const res = await GET(req);

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://boojy.store/cart");
  });

  it("returns HTTP 303 redirect directly to the Bachs checkout URL", async () => {
    const req = new Request("https://boojy.store/api/checkout/pay?order_id=ord-test-123");
    const res = await GET(req);

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://checkout.bachs.io/c/chk_test_123");
  });
});

describe("POST /api/checkout/pay", () => {
  it("redirects the browser straight to the Bachs checkout URL", async () => {
    vi.mocked(submitCheckout).mockResolvedValue({
      ok: true,
      orderId: "ord-test-123",
      orderNumber: "ORD-20261026-0001",
      totalAmount: 5000,
      checkoutUrl: "https://checkout.bachs.io/c/chk_from_post",
    });

    const body = new FormData();
    body.set(
      "payload",
      JSON.stringify({
        details: { paymentMethod: "bachs" },
        items: [],
      }),
    );
    const req = new Request("https://boojy.store/api/checkout/pay", {
      method: "POST",
      headers: {
        origin: "https://boojy.store",
        "sec-fetch-site": "same-origin",
      },
      body,
    });
    const res = await POST(req);

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("https://checkout.bachs.io/c/chk_from_post");
  });
});
