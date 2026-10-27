import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";

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

  it("returns an HTML handoff that opens the Bachs checkout URL", async () => {
    const req = new Request("https://boojy.store/api/checkout/pay?order_id=ord-test-123");
    const res = await GET(req);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("https://checkout.bachs.io/c/chk_test_123");
    expect(body).toContain('http-equiv="refresh"');
    expect(res.headers.get("location")).toBeNull();
  });
});
