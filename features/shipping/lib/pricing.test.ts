import { describe, it, expect } from "vitest";
import {
  resolveRatePrecedence,
  calculateAvailableShippingOptions,
} from "./pricing";
import type { ShippingMethod, ShippingRate } from "../types";

describe("Shipping Pricing Engine — Precedence & Calculations", () => {
  const methods: ShippingMethod[] = [
    {
      id: "own_delivery",
      name: "Own Delivery",
      method_type: "own_delivery",
      estimated_min_days: 1,
      estimated_max_days: 2,
      is_active: true,
      display_order: 1,
    },
    {
      id: "standard",
      name: "Standard Courier",
      method_type: "courier",
      estimated_min_days: 2,
      estimated_max_days: 4,
      is_active: true,
      display_order: 2,
    },
    {
      id: "pickup",
      name: "Store Pickup",
      method_type: "pickup",
      estimated_min_days: 0,
      estimated_max_days: 1,
      is_active: true,
      display_order: 3,
    },
  ];

  const stateId = "state-lagos";
  const lgaId = "lga-ikeja";
  const zoneId = "zone-ikeja-gra";

  const rates: ShippingRate[] = [
    // State-wide rate: ₦2,500
    {
      id: "rate-state-wide",
      shipping_method_id: "standard",
      state_id: stateId,
      price_kobo: 250000,
      is_active: true,
    },
    // LGA rate: ₦2,000
    {
      id: "rate-lga",
      shipping_method_id: "standard",
      state_id: stateId,
      lga_id: lgaId,
      price_kobo: 200000,
      is_active: true,
    },
    // Zone rate: ₦1,500
    {
      id: "rate-zone",
      shipping_method_id: "standard",
      state_id: stateId,
      delivery_zone_id: zoneId,
      price_kobo: 150000,
      is_active: true,
    },
    // Own delivery only configured for zone: ₦1,200
    {
      id: "rate-own-delivery-zone",
      shipping_method_id: "own_delivery",
      state_id: stateId,
      delivery_zone_id: zoneId,
      price_kobo: 120000,
      is_active: true,
    },
  ];

  it("1. selects the exact city/delivery-zone rate over LGA and state rates", () => {
    const result = resolveRatePrecedence(rates, "standard", stateId, lgaId, zoneId);
    expect(result).not.toBeNull();
    expect(result?.rate.id).toBe("rate-zone");
    expect(result?.rate.price_kobo).toBe(150000);
    expect(result?.scope).toBe("zone");
  });

  it("2. falls back to LGA rate when no zone rate matches", () => {
    const result = resolveRatePrecedence(rates, "standard", stateId, lgaId, "unknown-zone");
    expect(result).not.toBeNull();
    expect(result?.rate.id).toBe("rate-lga");
    expect(result?.rate.price_kobo).toBe(200000);
    expect(result?.scope).toBe("lga");
  });

  it("3. falls back to state-wide rate when neither zone nor LGA rate exists", () => {
    const result = resolveRatePrecedence(rates, "standard", stateId, "lga-badagry", null);
    expect(result).not.toBeNull();
    expect(result?.rate.id).toBe("rate-state-wide");
    expect(result?.rate.price_kobo).toBe(250000);
    expect(result?.scope).toBe("state");
  });

  it("4. returns null when no rate exists for that method and destination", () => {
    const result = resolveRatePrecedence(rates, "own_delivery", stateId, "lga-badagry", null);
    expect(result).toBeNull();
  });

  it("5. correctly flags location as unavailable if no method has a valid rate", () => {
    const unconfiguredRates: ShippingRate[] = [];
    const methodsWithoutPickup = methods.filter((m) => m.method_type !== "pickup");
    const response = calculateAvailableShippingOptions(methodsWithoutPickup, unconfiguredRates, {
      stateId: "unconfigured-state",
      lgaId: "some-lga",
    });

    expect(response.available).toBe(false);
    expect(response.options.length).toBe(0);
    expect(response.message).toContain("Delivery is not currently available");
  });

  it("6. applies free shipping threshold when subtotal qualifies", () => {
    const rateWithThreshold: ShippingRate = {
      id: "rate-free-shipping",
      shipping_method_id: "standard",
      state_id: stateId,
      price_kobo: 300000,
      free_shipping_threshold_kobo: 5000000, // ₦50,000
      is_active: true,
    };

    // Subtotal under threshold: pays regular rate
    const resUnder = calculateAvailableShippingOptions(
      methods.filter((m) => m.id === "standard"),
      [rateWithThreshold],
      { stateId, subtotalKobo: 4000000 },
    );
    expect(resUnder.options[0].priceKobo).toBe(300000);
    expect(resUnder.options[0].isFree).toBe(false);

    // Subtotal meets threshold: fee becomes 0
    const resQualifies = calculateAvailableShippingOptions(
      methods.filter((m) => m.id === "standard"),
      [rateWithThreshold],
      { stateId, subtotalKobo: 5500000 },
    );
    expect(resQualifies.options[0].priceKobo).toBe(0);
    expect(resQualifies.options[0].isFree).toBe(true);
  });
});
