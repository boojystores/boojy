import { describe, expect, it } from "vitest";
import {
  isValidEmail,
  isValidPhoneNumber,
  sanitizePhoneInput,
} from "./validation";
import { submitCheckout } from "@/features/checkout/actions";

describe("Checkout Validation Helpers", () => {
  describe("isValidPhoneNumber", () => {
    it("rejects phone numbers containing alphabetic letters", () => {
      expect(isValidPhoneNumber("080ABC12345")).toBe(false);
      expect(isValidPhoneNumber("08012345678a")).toBe(false);
      expect(isValidPhoneNumber("phone123456")).toBe(false);
      expect(isValidPhoneNumber("hello world")).toBe(false);
    });

    it("rejects phone numbers that are too short or too long", () => {
      expect(isValidPhoneNumber("12345")).toBe(false);
      expect(isValidPhoneNumber("08012345")).toBe(false);
      expect(isValidPhoneNumber("080123456789012345")).toBe(false);
      expect(isValidPhoneNumber("")).toBe(false);
      expect(isValidPhoneNumber(null)).toBe(false);
    });

    it("accepts valid Nigerian and international numeric phone formats", () => {
      expect(isValidPhoneNumber("08012345678")).toBe(true);
      expect(isValidPhoneNumber("07033334444")).toBe(true);
      expect(isValidPhoneNumber("09055556666")).toBe(true);
      expect(isValidPhoneNumber("08123456789")).toBe(true);
      expect(isValidPhoneNumber("+2348012345678")).toBe(true);
      expect(isValidPhoneNumber("+234 801 234 5678")).toBe(true);
      expect(isValidPhoneNumber("080-1234-5678")).toBe(true);
      expect(isValidPhoneNumber("(080) 1234567")).toBe(true);
    });

    it("sanitizePhoneInput strips letters and preserves valid characters", () => {
      expect(sanitizePhoneInput("080ABC12345")).toBe("08012345");
      expect(sanitizePhoneInput("hello +234 801 234")).toBe("+234 801 234");
      expect(sanitizePhoneInput("090-555-letters")).toBe("090-555-");
    });
  });

  describe("isValidEmail", () => {
    it("rejects emails without domain extensions like .com", () => {
      expect(isValidEmail("user@something")).toBe(false);
      expect(isValidEmail("user@gmail")).toBe(false);
      expect(isValidEmail("plainaddress")).toBe(false);
      expect(isValidEmail("@missingusername.com")).toBe(false);
      expect(isValidEmail("user@.com")).toBe(false);
      expect(isValidEmail("")).toBe(false);
      expect(isValidEmail(null)).toBe(false);
    });

    it("accepts valid emails with domain extensions", () => {
      expect(isValidEmail("user@gmail.com")).toBe(true);
      expect(isValidEmail("ada@boojy.com")).toBe(true);
      expect(isValidEmail("customer@yahoo.com")).toBe(true);
      expect(isValidEmail("info@store.co.uk")).toBe(true);
      expect(isValidEmail("customer@domain.com.ng")).toBe(true);
    });
  });

  describe("submitCheckout Server-side rejection", () => {
    const validItems = [{ productId: "p1", quantity: 1 }];

    it("rejects letters in contactNumber on the server", async () => {
      const res = await submitCheckout({
        details: {
          fullName: "Test Customer",
          email: "customer@gmail.com",
          contactNumber: "080ABC12345",
          deliveryAddress: "12 Victoria Island, Lagos",
          paymentMethod: "bank_transfer",
        },
        items: validItems,
      });

      expect(res.ok).toBe(false);
      if (!res.ok && res.code === "VALIDATION") {
        expect(res.field).toBe("contactNumber");
        expect(res.message).toContain("numeric");
      }
    });

    it("rejects email missing a domain extension on the server", async () => {
      const res = await submitCheckout({
        details: {
          fullName: "Test Customer",
          email: "customer@something",
          contactNumber: "08012345678",
          deliveryAddress: "12 Victoria Island, Lagos",
          paymentMethod: "bank_transfer",
        },
        items: validItems,
      });

      expect(res.ok).toBe(false);
      if (!res.ok && res.code === "VALIDATION") {
        expect(res.field).toBe("email");
        expect(res.message).toContain("domain");
      }
    });
  });
});
