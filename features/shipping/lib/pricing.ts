import type {
  ShippingMethod,
  ShippingRate,
  ShippingOption,
  ShippingCalculationRequest,
  ShippingCalculationResponse,
  PricingScope,
} from "../types";

/**
 * Resolves the applicable shipping rate for a destination and method according to the precedence rule:
 * 1. Exact city / delivery zone rate
 * 2. Applicable LGA rate
 * 3. State-wide rate
 * 4. NULL / Undefined (Unavailable)
 */
export function resolveRatePrecedence(
  rates: ShippingRate[],
  methodId: string,
  stateId: string,
  lgaId?: string | null,
  deliveryZoneId?: string | null,
): { rate: ShippingRate; scope: PricingScope } | null {
  const activeMethodRates = rates.filter(
    (r) => r.is_active && r.shipping_method_id === methodId && r.state_id === stateId,
  );

  // 1. Exact delivery zone / city rate
  if (deliveryZoneId) {
    const zoneRate = activeMethodRates.find(
      (r) => r.delivery_zone_id === deliveryZoneId,
    );
    if (zoneRate) {
      return { rate: zoneRate, scope: "zone" };
    }
  }

  // 2. Applicable LGA rate
  if (lgaId) {
    const lgaRate = activeMethodRates.find(
      (r) => r.lga_id === lgaId && !r.delivery_zone_id,
    );
    if (lgaRate) {
      return { rate: lgaRate, scope: "lga" };
    }
  }

  // 3. State-wide rate
  const stateRate = activeMethodRates.find(
    (r) => !r.lga_id && !r.delivery_zone_id,
  );
  if (stateRate) {
    return { rate: stateRate, scope: "state" };
  }

  // 4. Unavailable
  return null;
}

/**
 * Calculates available shipping options for a given destination and cart subtotal.
 */
export function calculateAvailableShippingOptions(
  methods: ShippingMethod[],
  rates: ShippingRate[],
  request: ShippingCalculationRequest,
): ShippingCalculationResponse {
  const { stateId, lgaId, deliveryZoneId, shippingMethodId, subtotalKobo = 0 } = request;

  if (!stateId) {
    return {
      ok: false,
      available: false,
      options: [],
      message: "Please select a state to calculate delivery rates.",
    };
  }

  const activeMethods = methods
    .filter((m) => m.is_active)
    .sort((a, b) => a.display_order - b.display_order);

  const options: ShippingOption[] = [];

  for (const method of activeMethods) {
    // If pickup is available, it is offered across all active destinations at ₦0
    if (method.method_type === "pickup") {
      options.push({
        methodId: method.id,
        methodName: method.name,
        methodType: method.method_type,
        description: method.description || "Pick up directly from store.",
        rateId: `pickup-${stateId}`,
        priceKobo: 0,
        priceNaira: 0,
        isFree: true,
        estimatedMinDays: method.estimated_min_days,
        estimatedMaxDays: method.estimated_max_days,
        scope: "state",
      });
      continue;
    }

    const match = resolveRatePrecedence(
      rates,
      method.id,
      stateId,
      lgaId,
      deliveryZoneId,
    );

    if (match) {
      const { rate, scope } = match;
      const freeThreshold = rate.free_shipping_threshold_kobo;
      const isFree =
        freeThreshold !== null &&
        freeThreshold !== undefined &&
        freeThreshold > 0 &&
        subtotalKobo >= freeThreshold;

      const finalKobo = isFree ? 0 : rate.price_kobo;
      const finalNaira = Math.round(finalKobo / 100);

      options.push({
        methodId: method.id,
        methodName: method.name,
        methodType: method.method_type,
        description:
          method.description ||
          `Estimated delivery in ${rate.estimated_min_days || method.estimated_min_days}–${rate.estimated_max_days || method.estimated_max_days} days`,
        rateId: rate.id,
        priceKobo: finalKobo,
        priceNaira: finalNaira,
        isFree,
        estimatedMinDays: rate.estimated_min_days || method.estimated_min_days,
        estimatedMaxDays: rate.estimated_max_days || method.estimated_max_days,
        scope,
      });
    }
  }

  if (options.length === 0) {
    return {
      ok: true,
      available: false,
      options: [],
      message:
        "Delivery is not currently available to this destination. Please check the address or contact customer support.",
    };
  }

  const selectedOption =
    options.find((opt) => opt.methodId === shippingMethodId) || options[0];

  return {
    ok: true,
    available: true,
    options,
    selectedOption,
  };
}
