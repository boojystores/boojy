import type {
  ShippingMethod,
  ShippingRate,
  DeliveryZone,
  NigerianState,
  NigerianLga,
  PricingScope,
  ShippingOption,
} from "../types";
import { NIGERIA_STATES_AND_LGAS } from "../data/nigeria-data";

export const DEFAULT_SHIPPING_METHODS: ShippingMethod[] = [
  {
    id: "own_delivery",
    name: "Boojy Dispatch (Own Delivery)",
    method_type: "own_delivery",
    description: "Handled directly by Boojy dispatch riders with active status updates.",
    estimated_min_days: 1,
    estimated_max_days: 2,
    is_active: true,
    display_order: 1,
  },
  {
    id: "standard",
    name: "Standard Courier Delivery",
    method_type: "courier",
    description: "Reliable doorstep delivery via our nationwide courier partner network.",
    estimated_min_days: 2,
    estimated_max_days: 4,
    is_active: true,
    display_order: 2,
  },
  {
    id: "express",
    name: "Express Priority Delivery",
    method_type: "courier",
    description: "Rapid priority dispatch for urgent deliveries.",
    estimated_min_days: 1,
    estimated_max_days: 2,
    is_active: true,
    display_order: 3,
  },
  {
    id: "pickup",
    name: "Store Pickup / Hub Collection",
    method_type: "pickup",
    description: "Collect in person from our flagship store at zero shipping fee.",
    estimated_min_days: 0,
    estimated_max_days: 1,
    is_active: true,
    display_order: 4,
  },
];

// Generate deterministic IDs for initial dataset
export const BUILTIN_STATES: NigerianState[] = NIGERIA_STATES_AND_LGAS.map((s, idx) => ({
  id: `00000000-0000-0000-0001-${String(idx + 1).padStart(12, "0")}`,
  name: s.name,
  code: s.code,
  is_active: true,
}));

export const BUILTIN_LGAS: NigerianLga[] = NIGERIA_STATES_AND_LGAS.flatMap((s, sIdx) => {
  const stateId = `00000000-0000-0000-0001-${String(sIdx + 1).padStart(12, "0")}`;
  return s.lgas.map((lgaName, lIdx) => ({
    id: `00000000-0000-0002-${String(sIdx + 1).padStart(4, "0")}-${String(lIdx + 1).padStart(8, "0")}`,
    state_id: stateId,
    name: lgaName,
    code: `${s.code}-${lIdx + 1}`,
    is_active: true,
  }));
});

// Built-in initial Delivery Zones for major hubs
export const BUILTIN_DELIVERY_ZONES: DeliveryZone[] = [
  // Lagos zones
  {
    id: "00000000-0000-0003-0001-000000000001",
    state_id: BUILTIN_STATES.find((s) => s.name === "Lagos")!.id,
    name: "Victoria Island",
    aliases: ["V.I", "VI", "Victoria Island Extension"],
    is_active: true,
  },
  {
    id: "00000000-0000-0003-0001-000000000002",
    state_id: BUILTIN_STATES.find((s) => s.name === "Lagos")!.id,
    name: "Lekki Phase 1",
    aliases: ["Lekki 1", "Admiralty", "Lekki Phase I"],
    is_active: true,
  },
  {
    id: "00000000-0000-0003-0001-000000000003",
    state_id: BUILTIN_STATES.find((s) => s.name === "Lagos")!.id,
    name: "Ikoyi",
    aliases: ["Old Ikoyi", "Banana Island", "Parkview"],
    is_active: true,
  },
  {
    id: "00000000-0000-0003-0001-000000000004",
    state_id: BUILTIN_STATES.find((s) => s.name === "Lagos")!.id,
    name: "Ikeja GRA / Central",
    aliases: ["GRA Ikeja", "Alausa", "Allen", "Opebi"],
    is_active: true,
  },
  // FCT Abuja zones
  {
    id: "00000000-0000-0003-0002-000000000001",
    state_id: BUILTIN_STATES.find((s) => s.name === "Federal Capital Territory")!.id,
    name: "Abuja Central / Maitama / Wuse 2",
    aliases: ["Maitama", "Wuse 2", "Garki", "Asokoro"],
    is_active: true,
  },
  // Imo zone
  {
    id: "00000000-0000-0003-0003-000000000001",
    state_id: BUILTIN_STATES.find((s) => s.name === "Imo")!.id,
    name: "Owerri Urban / Ikenegbu / Aladinma",
    aliases: ["Ikenegbu", "Aladinma", "Works Layout", "New Owerri"],
    is_active: true,
  },
];

/**
 * Builds standard default rates across Nigerian destinations:
 * - Specific zone rates in key commercial hubs (₦2,000)
 * - State-wide Standard delivery for Lagos (₦2,500), Express (₦4,500)
 * - State-wide Standard for FCT, Imo, Rivers (₦3,000 - ₦3,500)
 * - State-wide Standard for all other states (₦4,000)
 * - Pickup method always ₦0
 */
export function buildDefaultShippingRates(): ShippingRate[] {
  const rates: ShippingRate[] = [];

  const lagos = BUILTIN_STATES.find((s) => s.name === "Lagos")!;
  const fct = BUILTIN_STATES.find((s) => s.name === "Federal Capital Territory")!;
  const imo = BUILTIN_STATES.find((s) => s.name === "Imo")!;
  const rivers = BUILTIN_STATES.find((s) => s.name === "Rivers")!;

  // 1. Pickup rate (Nationwide ₦0)
  rates.push({
    id: "rate-pickup-lagos",
    shipping_method_id: "pickup",
    state_id: lagos.id,
    price_kobo: 0,
    estimated_min_days: 0,
    estimated_max_days: 1,
    is_active: true,
    scope: "state",
  });

  // 2. Exact Zone Rates in Lagos (₦2,000 Own Delivery)
  for (const zone of BUILTIN_DELIVERY_ZONES.filter((z) => z.state_id === lagos.id)) {
    rates.push({
      id: `rate-zone-${zone.id}`,
      shipping_method_id: "own_delivery",
      state_id: lagos.id,
      delivery_zone_id: zone.id,
      price_kobo: 200000, // ₦2,000
      estimated_min_days: 1,
      estimated_max_days: 2,
      is_active: true,
      scope: "zone",
    });
  }

  // 3. Lagos State-wide Standard & Express
  rates.push({
    id: "rate-standard-lagos",
    shipping_method_id: "standard",
    state_id: lagos.id,
    price_kobo: 250000, // ₦2,500
    estimated_min_days: 2,
    estimated_max_days: 3,
    is_active: true,
    scope: "state",
  });
  rates.push({
    id: "rate-express-lagos",
    shipping_method_id: "express",
    state_id: lagos.id,
    price_kobo: 450000, // ₦4,500
    estimated_min_days: 1,
    estimated_max_days: 1,
    is_active: true,
    scope: "state",
  });

  // 4. FCT Abuja Rates
  rates.push({
    id: "rate-standard-fct",
    shipping_method_id: "standard",
    state_id: fct.id,
    price_kobo: 300000, // ₦3,000
    estimated_min_days: 2,
    estimated_max_days: 3,
    is_active: true,
    scope: "state",
  });
  rates.push({
    id: "rate-express-fct",
    shipping_method_id: "express",
    state_id: fct.id,
    price_kobo: 550000, // ₦5,500
    estimated_min_days: 1,
    estimated_max_days: 2,
    is_active: true,
    scope: "state",
  });

  // 5. Imo State Rates (Owerri hub)
  rates.push({
    id: "rate-standard-imo",
    shipping_method_id: "standard",
    state_id: imo.id,
    price_kobo: 300000, // ₦3,000
    estimated_min_days: 2,
    estimated_max_days: 3,
    is_active: true,
    scope: "state",
  });

  // 6. Rivers State Rates (Port Harcourt hub)
  rates.push({
    id: "rate-standard-rivers",
    shipping_method_id: "standard",
    state_id: rivers.id,
    price_kobo: 350000, // ₦3,500
    estimated_min_days: 2,
    estimated_max_days: 3,
    is_active: true,
    scope: "state",
  });

  // 7. All other states standard rates
  for (const s of BUILTIN_STATES) {
    if ([lagos.id, fct.id, imo.id, rivers.id].includes(s.id)) continue;

    rates.push({
      id: `rate-standard-${s.code.toLowerCase()}`,
      shipping_method_id: "standard",
      state_id: s.id,
      price_kobo: 400000, // ₦4,000
      estimated_min_days: 3,
      estimated_max_days: 5,
      is_active: true,
      scope: "state",
    });
  }

  return rates;
}

export const DEFAULT_SHIPPING_RATES: ShippingRate[] = buildDefaultShippingRates();
