import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isValidPaymentGatewayUrl,
  navigateToPaymentGateway,
} from "./navigation";

describe("Payment Gateway Navigation & Domain Security", () => {
  let originalWindow: Window & typeof globalThis;

  beforeEach(() => {
    originalWindow = globalThis.window;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.window = originalWindow;
  });

  describe("isValidPaymentGatewayUrl", () => {
    it("accepts official Bachs checkout URLs over HTTPS", () => {
      expect(isValidPaymentGatewayUrl("https://checkout.bachs.io/c/chk_123456789")).toBe(true);
      expect(isValidPaymentGatewayUrl("https://checkout.bachs.io/session/test")).toBe(true);
      expect(isValidPaymentGatewayUrl("https://bachs.io/pay/123")).toBe(true);
      expect(isValidPaymentGatewayUrl("https://sandbox.bachs.io/c/chk_test")).toBe(true);
    });

    it("rejects non-HTTPS protocols on production domains", () => {
      expect(isValidPaymentGatewayUrl("http://checkout.bachs.io/c/chk_123")).toBe(false);
      expect(isValidPaymentGatewayUrl("ftp://checkout.bachs.io/c/chk_123")).toBe(false);
    });

    it("rejects untrusted third-party and phishing domains", () => {
      expect(isValidPaymentGatewayUrl("https://evil.com/c/chk_123")).toBe(false);
      expect(isValidPaymentGatewayUrl("https://checkout.bachs.io.evil.com/c/123")).toBe(false);
      expect(isValidPaymentGatewayUrl("https://fakebachs.io/c/123")).toBe(false);
      expect(isValidPaymentGatewayUrl("https://checkout-bachs.io/c/123")).toBe(false);
    });

    it("rejects bare session IDs without a valid URL", () => {
      expect(isValidPaymentGatewayUrl("chk_123456789")).toBe(false);
      expect(isValidPaymentGatewayUrl("sess_abc123")).toBe(false);
      expect(isValidPaymentGatewayUrl("/checkout/pay?order_id=123")).toBe(false);
    });

    it("rejects dangerous script schemes and malformed strings", () => {
      expect(isValidPaymentGatewayUrl("javascript:alert(1)")).toBe(false);
      expect(isValidPaymentGatewayUrl("data:text/html,<script>")).toBe(false);
      expect(isValidPaymentGatewayUrl("not a url")).toBe(false);
      expect(isValidPaymentGatewayUrl("")).toBe(false);
      expect(isValidPaymentGatewayUrl("   ")).toBe(false);
      expect(isValidPaymentGatewayUrl(null)).toBe(false);
      expect(isValidPaymentGatewayUrl(undefined)).toBe(false);
    });
  });

  describe("navigateToPaymentGateway", () => {
    it("navigates using window.location.assign(paymentUrl) for verified URLs", () => {
      const mockWindow = {
        location: {
          href: "",
          assign: vi.fn(),
        },
      };
      globalThis.window = mockWindow as unknown as Window & typeof globalThis;

      const validUrl = "https://checkout.bachs.io/c/chk_test_999";
      const result = navigateToPaymentGateway(validUrl);

      expect(result.success).toBe(true);
      expect(mockWindow.location.assign).toHaveBeenCalledWith(validUrl);
    });

    it("refuses navigation and returns an error for invalid or disallowed URLs", () => {
      const mockWindow = {
        location: {
          href: "",
          assign: vi.fn(),
        },
      };
      globalThis.window = mockWindow as unknown as Window & typeof globalThis;

      const badUrl = "https://attacker.com/malicious-checkout";
      const result = navigateToPaymentGateway(badUrl);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("DISALLOWED_DOMAIN");
      }
      expect(mockWindow.location.assign).not.toHaveBeenCalled();
    });

    it("handles empty or missing URLs safely without throwing", () => {
      const mockWindow = {
        location: {
          href: "",
          assign: vi.fn(),
        },
      };
      globalThis.window = mockWindow as unknown as Window & typeof globalThis;

      const result = navigateToPaymentGateway(null);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("INVALID_URL");
      }
      expect(mockWindow.location.assign).not.toHaveBeenCalled();
    });

    it("falls back to window.location.href if assign throws", () => {
      const mockWindow = {
        location: {
          href: "",
          assign: vi.fn(() => {
            throw new Error("Assign blocked");
          }),
        },
      };
      globalThis.window = mockWindow as unknown as Window & typeof globalThis;

      const validUrl = "https://checkout.bachs.io/c/chk_fallback";
      const result = navigateToPaymentGateway(validUrl);

      expect(result.success).toBe(true);
      expect(mockWindow.location.href).toBe(validUrl);
    });
  });
});
