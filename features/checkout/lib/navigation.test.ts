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

  it("navigates to same-origin bridge when orderId is provided", () => {
    const mockWindow = {
      location: {
        href: "",
        assign: vi.fn(),
      },
    };
    globalThis.window = mockWindow as any;

    navigateToPaymentGateway("https://checkout.bachs.io/c/123", "ord-999");

    expect(mockWindow.location.assign).toHaveBeenCalledWith("/api/checkout/pay?order_id=ord-999");
  });

  it("navigates to direct URL when orderId is not provided", () => {
    const mockWindow = {
      location: {
        href: "",
        assign: vi.fn(),
      },
    };
    globalThis.window = mockWindow as any;

    const testUrl = "https://checkout.bachs.io/c/chk_123456";
    navigateToPaymentGateway(testUrl);

    expect(mockWindow.location.assign).toHaveBeenCalledWith(testUrl);
  });
});
