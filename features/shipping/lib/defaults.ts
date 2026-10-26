import type {
  ShippingMethod,
  ShippingRate,
  DeliveryZone,
  PickupLocation,
  NigerianState,
  NigerianLga,
  PricingScope,
  ShippingOption,
} from "../types";
import { NIGERIA_STATES_AND_LGAS } from "../data/nigeria-data";

export const DEFAULT_SHIPPING_METHODS: ShippingMethod[] = [
  {
    id: "standard",
    name: "Delivery",
    method_type: "courier",
    description: "Doorstep delivery to your address.",
    estimated_min_days: 1,
    estimated_max_days: 3,
    is_active: true,
    display_order: 1,
  },
  {
    id: "own_delivery",
    name: "Delivery",
    method_type: "own_delivery",
    description: "Doorstep delivery to your address.",
    estimated_min_days: 1,
    estimated_max_days: 2,
    is_active: true,
    display_order: 2,
  },
  {
    id: "express",
    name: "Express Delivery",
    method_type: "courier",
    description: "Fast doorstep delivery.",
    estimated_min_days: 1,
    estimated_max_days: 1,
    is_active: true,
    display_order: 3,
  },
  {
    id: "pickup",
    name: "Pickup",
    method_type: "pickup",
    description: "Store pickup.",
    estimated_min_days: 0,
    estimated_max_days: 1,
    is_active: true,
    display_order: 4,
  },
];

// Generate deterministic IDs for initial dataset (8-4-4-4-12 UUID format)
export const BUILTIN_STATES: NigerianState[] = NIGERIA_STATES_AND_LGAS.map((s, idx) => ({
  id: `00000000-0000-0001-0000-${String(idx + 1).padStart(12, "0")}`,
  name: s.name,
  code: s.code,
  is_active: true,
}));

export const BUILTIN_LGAS: NigerianLga[] = NIGERIA_STATES_AND_LGAS.flatMap((s, sIdx) => {
  const stateId = `00000000-0000-0001-0000-${String(sIdx + 1).padStart(12, "0")}`;
  return s.lgas.map((lgaName, lIdx) => ({
    id: `00000000-0000-0002-${String(sIdx + 1).padStart(4, "0")}-${String(lIdx + 1).padStart(12, "0")}`,
    state_id: stateId,
    name: lgaName,
    code: `${s.code}-${lIdx + 1}`,
    is_active: true,
  }));
});

// Helper lookups for initial zones
const lagosState = BUILTIN_STATES.find((s) => s.name === "Lagos")!;
const etiOsaLga = BUILTIN_LGAS.find((l) => l.state_id === lagosState?.id && (l.name === "Eti-Osa" || l.name === "Eti Osa"));
const ikejaLga = BUILTIN_LGAS.find((l) => l.state_id === lagosState?.id && l.name === "Ikeja");

const fctState = BUILTIN_STATES.find((s) => s.name === "Federal Capital Territory")!;
const amacLga = BUILTIN_LGAS.find((l) => l.state_id === fctState?.id && (l.name === "Municipal Area Council" || l.name.includes("Municipal")));

const imoState = BUILTIN_STATES.find((s) => s.name === "Imo")!;
const owerriMunicipalLga = BUILTIN_LGAS.find((l) => l.state_id === imoState?.id && l.name === "Owerri Municipal");

// Built-in initial Delivery Zones for major hubs (each strictly tied to its LGA)
export const BUILTIN_DELIVERY_ZONES: DeliveryZone[] = [
  // Lagos zones (Eti-Osa and Ikeja)
  {
    id: "00000000-0000-0003-0025-000000000001",
    state_id: lagosState.id,
    lga_id: etiOsaLga?.id || null,
    name: "Victoria Island",
    aliases: ["V.I", "VI", "Victoria Island Extension"],
    base_price_kobo: null,
    estimated_days: null,
    is_active: true,
  },
  {
    id: "00000000-0000-0003-0025-000000000002",
    state_id: lagosState.id,
    lga_id: etiOsaLga?.id || null,
    name: "Lekki Phase 1",
    aliases: ["Lekki 1", "Admiralty", "Lekki Phase I"],
    base_price_kobo: null,
    estimated_days: null,
    is_active: true,
  },
  {
    id: "00000000-0000-0003-0025-000000000003",
    state_id: lagosState.id,
    lga_id: etiOsaLga?.id || null,
    name: "Ikoyi",
    aliases: ["Old Ikoyi", "Banana Island", "Parkview"],
    base_price_kobo: null,
    estimated_days: null,
    is_active: true,
  },
  {
    id: "00000000-0000-0003-0025-000000000004",
    state_id: lagosState.id,
    lga_id: ikejaLga?.id || null,
    name: "Ikeja GRA / Central",
    aliases: ["GRA Ikeja", "Alausa", "Allen", "Opebi"],
    base_price_kobo: null,
    estimated_days: null,
    is_active: true,
  },
  // FCT Abuja zones (AMAC)
  {
    id: "00000000-0000-0003-0015-000000000001",
    state_id: fctState.id,
    lga_id: amacLga?.id || null,
    name: "Abuja Central / Maitama / Wuse 2",
    aliases: ["Maitama", "Wuse 2", "Garki", "Asokoro"],
    base_price_kobo: null,
    estimated_days: null,
    is_active: true,
  },
  // Imo zone (Owerri Municipal)
  {
    id: "00000000-0000-0003-0017-000000000001",
    state_id: imoState.id,
    lga_id: owerriMunicipalLga?.id || null,
    name: "Owerri Urban / Ikenegbu / Aladinma",
    aliases: ["Ikenegbu", "Aladinma", "Works Layout", "New Owerri"],
    base_price_kobo: null,
    estimated_days: null,
    is_active: true,
  },
];

// Built-in initial Pickup Store Locations (empty by default; configured via admin)
export const BUILTIN_PICKUP_LOCATIONS: PickupLocation[] = [];


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

  // 7. Note: No rates are assigned to other states by default.
  // Only states and zones explicitly configured and enabled in the database / admin dashboard
  // will be deliverable. Unconfigured states will be flagged as unavailable.
  return rates;
}

export const DEFAULT_SHIPPING_RATES: ShippingRate[] = buildDefaultShippingRates();

