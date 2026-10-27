import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { navigateToPaymentGateway } from "./navigation";

describe("navigateToPaymentGateway", () => {
  let originalWindow: any;

  beforeEach(() => {
    originalWindow = globalThis.window;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.window = originalWindow;
  });

  it("safely handles null, undefined, or empty string without throwing", () => {
    expect(() => navigateToPaymentGateway(null)).not.toThrow();
    expect(() => navigateToPaymentGateway(undefined)).not.toThrow();
    expect(() => navigateToPaymentGateway("   ")).not.toThrow();
  });

  it("navigates directly to the target URL using standard web procedure", () => {
    const mockWindow = {
      location: {
        href: "",
        assign: vi.fn(),
      },
    };
    globalThis.window = mockWindow as any;

    const testUrl = "https://checkout.bachs.io/c/123";
    navigateToPaymentGateway(testUrl, "ord-999");

    expect(mockWindow.location.href).toBe(testUrl);
  });

  it("navigates to same-origin bridge when targetUrl is missing but orderId is provided", () => {
    const mockWindow = {
      location: {
        href: "",
        assign: vi.fn(),
      },
    };
    globalThis.window = mockWindow as any;

    navigateToPaymentGateway("", "ord-999");

    expect(mockWindow.location.href).toBe("/api/checkout/pay?order_id=ord-999");
  });
});
