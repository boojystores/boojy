"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { assertAdmin } from "@/lib/auth/assert-admin";
import {
  BUILTIN_STATES,
  BUILTIN_LGAS,
  BUILTIN_DELIVERY_ZONES,
  BUILTIN_PICKUP_LOCATIONS,
  DEFAULT_SHIPPING_METHODS,
  DEFAULT_SHIPPING_RATES,
} from "./lib/defaults";
import {
  calculateAvailableShippingOptions,
  resolveRatePrecedence,
} from "./lib/pricing";
import type {
  NigerianState,
  NigerianLga,
  DeliveryZone,
  PickupLocation,
  ShippingMethod,
  ShippingRate,
  ShippingCalculationRequest,
  ShippingCalculationResponse,
  ShipmentStatus,
} from "./types";

/**
 * In-memory fallback caches for seamless development resilience
 */
let customDeliveryZones: DeliveryZone[] = [...BUILTIN_DELIVERY_ZONES];
let activeShippingRates: ShippingRate[] = [...DEFAULT_SHIPPING_RATES];
let activeShippingMethods: ShippingMethod[] = [...DEFAULT_SHIPPING_METHODS];
let activePickupLocations: PickupLocation[] = [...BUILTIN_PICKUP_LOCATIONS];

/**
/**
 * Fetch Nigerian states.
 * If onlyDeliverable is true, returns ONLY states with active rates/zones configured.
 */
export async function getStates(onlyDeliverable = false): Promise<NigerianState[]> {
  let allStates: NigerianState[] = [];
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("states")
      .select("id, name, code, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (!error && data && data.length > 0) {
      allStates = data;
    }
  } catch {
    // Fall back to built-in dataset
  }
  if (allStates.length === 0) {
    allStates = BUILTIN_STATES;
  }

  if (!onlyDeliverable) {
    return allStates;
  }

  // Filter to only states that have an active rate or zone
  const [rates, zones] = await Promise.all([
    getShippingRates(),
    getDeliveryZones(),
  ]);

  const deliverableStateIds = new Set<string>();
  for (const r of rates) {
    if (r.is_active && r.state_id) deliverableStateIds.add(r.state_id);
  }
  for (const z of zones) {
    if (z.is_active && z.state_id) deliverableStateIds.add(z.state_id);
  }

  return allStates.filter((s) => {
    return (
      deliverableStateIds.has(s.id) ||
      Array.from(deliverableStateIds).some(
        (id) => s.id.endsWith(id.slice(-4)) || id.endsWith(s.id.slice(-4)),
      )
    );
  });
}

/**
 * Fetch active LGAs.
 * If onlyDeliverable is true and stateId is specified:
 * - If that state has an active state-wide rate (no lga_id or delivery_zone_id), all LGAs for that state are deliverable.
 * - Otherwise, returns ONLY LGAs that have an active rate or zone specifically configured.
 */
export async function getLgas(stateId?: string, onlyDeliverable = false): Promise<NigerianLga[]> {
  let lgasForState: NigerianLga[] = [];
  try {
    const supabase = createServiceClient();
    let query = supabase
      .from("lgas")
      .select("id, state_id, name, code, is_active")
      .eq("is_active", true);

    if (stateId) {
      query = query.eq("state_id", stateId);
    }

    const { data, error } = await query.order("name", { ascending: true });

    if (!error && data && data.length > 0) {
      lgasForState = data;
    }
  } catch {
    // Fall back to built-in dataset
  }

  if (lgasForState.length === 0) {
    if (!stateId) {
      lgasForState = BUILTIN_LGAS;
    } else {
      const filtered = BUILTIN_LGAS.filter(
        (l) => l.state_id === stateId || l.state_id.endsWith(stateId.slice(-4)),
      );
      if (filtered.length > 0) {
        lgasForState = filtered;
      } else {
        const builtinState = BUILTIN_STATES.find(
          (s) => s.id === stateId || s.id.endsWith(stateId.slice(-4)),
        );
        if (builtinState) {
          lgasForState = BUILTIN_LGAS.filter((l) => l.state_id === builtinState.id);
        }
      }
    }
  }

  if (!onlyDeliverable || !stateId) {
    return lgasForState;
  }

  // Check rates and zones for this state
  const [rates, zones] = await Promise.all([
    getShippingRates(),
    getDeliveryZones(stateId),
  ]);

  const activeRatesForState = rates.filter(
    (r) => r.is_active && (r.state_id === stateId || r.state_id.endsWith(stateId.slice(-4))),
  );

  // If there is an active rate with no lga_id and no delivery_zone_id, that is a State-Wide flat rate!
  const hasStateWideRate = activeRatesForState.some(
    (r) => !r.lga_id && !r.delivery_zone_id,
  );
  if (hasStateWideRate) {
    return lgasForState;
  }

  // Otherwise, only specific LGAs that have an active rate or zone are deliverable
  const deliverableLgaIds = new Set<string>();
  for (const r of activeRatesForState) {
    if (r.lga_id) deliverableLgaIds.add(r.lga_id);
  }
  for (const z of zones) {
    if (z.is_active && z.lga_id) deliverableLgaIds.add(z.lga_id);
  }

  return lgasForState.filter(
    (l) =>
      deliverableLgaIds.has(l.id) ||
      Array.from(deliverableLgaIds).some(
        (id) => l.id.endsWith(id.slice(-4)) || id.endsWith(l.id.slice(-4)),
      ),
  );
}

/**
 * Fetch active delivery zones / cities for a state and optional LGA, or all zones if stateId is omitted
 */
export async function getDeliveryZones(
  stateId?: string,
  lgaId?: string | null,
): Promise<DeliveryZone[]> {
  try {
    const supabase = createServiceClient();
    let query = supabase
      .from("delivery_zones")
      .select("id, state_id, lga_id, name, aliases, base_price_kobo, estimated_days, is_active")
      .eq("is_active", true);

    if (stateId) {
      query = query.eq("state_id", stateId);
    }

    if (lgaId) {
      query = query.or(`lga_id.is.null,lga_id.eq.${lgaId}`);
    }

    const { data, error } = await query.order("name", { ascending: true });
    if (!error && data && data.length > 0) {
      return data.map((z: any) => ({
        ...z,
        base_price_kobo: z.base_price_kobo ?? null,
        estimated_days: z.estimated_days ?? null,
      }));
    }
  } catch {
    // Fall back
  }

  if (!stateId) {
    return customDeliveryZones.filter((z) => z.is_active);
  }

  return customDeliveryZones.filter((z) => {
    if (z.state_id !== stateId && !z.state_id.endsWith(stateId.slice(-4))) return false;
    if (lgaId && z.lga_id && z.lga_id !== lgaId) return false;
    return z.is_active;
  });
}

/**
 * Fetch configured shipping methods
 */
export async function getShippingMethods(): Promise<ShippingMethod[]> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("shipping_methods")
      .select("*")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (!error && data && data.length > 0) {
      return data;
    }
  } catch {
    // Fall back
  }
  return activeShippingMethods.filter((m) => m.is_active);
}

/**
 * Fetch all configured shipping rates (with related objects for admin & calculations)
 */
export async function getShippingRates(): Promise<ShippingRate[]> {
  try {
    const supabase = createServiceClient();
    // 1. Check PostgreSQL shipping_rates table
    const { data, error } = await supabase
      .from("shipping_rates")
      .select(`
        id,
        shipping_method_id,
        state_id,
        lga_id,
        delivery_zone_id,
        price_kobo,
        free_shipping_threshold_kobo,
        estimated_min_days,
        estimated_max_days,
        is_active,
        created_at,
        updated_at,
        shipping_methods ( id, name, method_type, description, estimated_min_days, estimated_max_days ),
        states ( id, name, code ),
        lgas ( id, name ),
        delivery_zones ( id, name )
      `)
      .order("created_at", { ascending: false });

    if (!error && data && data.length > 0) {
      return data.map((r: any) => ({
        id: r.id,
        shipping_method_id: r.shipping_method_id,
        shipping_method: r.shipping_methods,
        state_id: r.state_id,
        state: r.states,
        lga_id: r.lga_id,
        lga: r.lgas,
        delivery_zone_id: r.delivery_zone_id,
        delivery_zone: r.delivery_zones,
        price_kobo: Number(r.price_kobo),
        free_shipping_threshold_kobo: r.free_shipping_threshold_kobo
          ? Number(r.free_shipping_threshold_kobo)
          : null,
        estimated_min_days: r.estimated_min_days,
        estimated_max_days: r.estimated_max_days,
        is_active: r.is_active,
        created_at: r.created_at,
        updated_at: r.updated_at,
        scope: r.delivery_zone_id ? "zone" : r.lga_id ? "lga" : "state",
      }));
    }

    // 2. Check store_settings table for persistent admin changes if table isn't created
    const { data: settingsData } = await supabase
      .from("store_settings")
      .select("value")
      .eq("key", "shipping_rates_config")
      .maybeSingle();

    if (Array.isArray(settingsData?.value) && settingsData.value.length > 0) {
      activeShippingRates = settingsData.value as ShippingRate[];
      return activeShippingRates;
    }
  } catch {
    // Fall through
  }

  return activeShippingRates;
}

/**
 * Authoritative Server-Side Shipping Calculator
 * Evaluates available options and rates for a destination.
 */
export async function calculateShippingOptionsServer(
  request: ShippingCalculationRequest,
): Promise<ShippingCalculationResponse> {
  const [methods, rates, zones] = await Promise.all([
    getShippingMethods(),
    getShippingRates(),
    getDeliveryZones(request.stateId),
  ]);

  // If request specifies a delivery zone and that zone defines a custom price,
  // ensure the zone rate is injected into the pricing matrix so it applies with highest precedence:
  let effectiveRates = rates;
  if (request.deliveryZoneId) {
    const matchedZone = zones.find((z) => z.id === request.deliveryZoneId);
    if (matchedZone && matchedZone.base_price_kobo !== undefined && matchedZone.base_price_kobo !== null) {
      const hasZoneRate = rates.some(
        (r) => r.is_active && r.delivery_zone_id === request.deliveryZoneId,
      );
      if (!hasZoneRate) {
        effectiveRates = [
          {
            id: `zone-rate-${matchedZone.id}`,
            shipping_method_id: "own_delivery",
            state_id: matchedZone.state_id,
            lga_id: matchedZone.lga_id || null,
            delivery_zone_id: matchedZone.id,
            price_kobo: matchedZone.base_price_kobo,
            is_active: true,
            scope: "zone",
          },
          ...rates,
        ];
      }
    }
  }

  return calculateAvailableShippingOptions(methods, effectiveRates, request);
}

/**
 * Admin: Add a new shipping rate
 */
export async function createShippingRateAction(payload: {
  shippingMethodId: string;
  stateId: string;
  lgaId?: string | null;
  deliveryZoneId?: string | null;
  customZoneName?: string | null;
  priceNaira: number;
  freeShippingThresholdNaira?: number | null;
  estimatedMinDays?: number | null;
  estimatedMaxDays?: number | null;
  isActive?: boolean;
}): Promise<{ ok: boolean; message?: string; rate?: ShippingRate }> {
  await assertAdmin();

  const priceKobo = Math.round(Number(payload.priceNaira) * 100);
  if (isNaN(priceKobo) || priceKobo < 0) {
    return { ok: false, message: "Invalid delivery price. Must be 0 or greater." };
  }

  let targetDeliveryZoneId = payload.deliveryZoneId || null;

  // If a custom zone name is provided, automatically create the delivery zone and link it
  if (payload.customZoneName?.trim()) {
    const zoneName = payload.customZoneName.trim();
    const zoneRes = await createDeliveryZoneAction({
      stateId: payload.stateId,
      lgaId: payload.lgaId || null,
      name: zoneName,
      priceNaira: payload.priceNaira,
      estimatedDays:
        payload.estimatedMinDays && payload.estimatedMaxDays
          ? `${payload.estimatedMinDays}–${payload.estimatedMaxDays} business days`
          : undefined,
    });
    if (zoneRes.ok && zoneRes.zone) {
      targetDeliveryZoneId = zoneRes.zone.id;
    }
  }

  const freeKobo = payload.freeShippingThresholdNaira
    ? Math.round(Number(payload.freeShippingThresholdNaira) * 100)
    : null;

  const scope = targetDeliveryZoneId
    ? "zone"
    : payload.lgaId
      ? "lga"
      : "state";

  const newRate: ShippingRate = {
    id: `rate_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    shipping_method_id: payload.shippingMethodId,
    state_id: payload.stateId,
    lga_id: payload.lgaId || null,
    delivery_zone_id: targetDeliveryZoneId,
    price_kobo: priceKobo,
    free_shipping_threshold_kobo: freeKobo,
    estimated_min_days: payload.estimatedMinDays ? Number(payload.estimatedMinDays) : null,
    estimated_max_days: payload.estimatedMaxDays ? Number(payload.estimatedMaxDays) : null,
    is_active: payload.isActive !== false,
    scope,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const supabase = createServiceClient();
    // 1. Try PostgreSQL table
    const { data, error } = await supabase
      .from("shipping_rates")
      .insert({
        shipping_method_id: newRate.shipping_method_id,
        state_id: newRate.state_id,
        lga_id: newRate.lga_id,
        delivery_zone_id: newRate.delivery_zone_id,
        price_kobo: newRate.price_kobo,
        free_shipping_threshold_kobo: newRate.free_shipping_threshold_kobo,
        estimated_min_days: newRate.estimated_min_days,
        estimated_max_days: newRate.estimated_max_days,
        is_active: newRate.is_active,
      })
      .select()
      .maybeSingle();

    if (!error && data) {
      revalidatePath("/admin/shipping");
      revalidatePath("/checkout");
      return { ok: true, rate: data };
    }

    // 2. Persist to store_settings
    activeShippingRates = [newRate, ...activeShippingRates];
    await supabase.from("store_settings").upsert({
      key: "shipping_rates_config",
      value: activeShippingRates,
      updated_at: new Date().toISOString(),
    });

    revalidatePath("/admin/shipping");
    revalidatePath("/checkout");
    return { ok: true, rate: newRate };
  } catch (err: any) {
    // In-memory fallback
    activeShippingRates = [newRate, ...activeShippingRates];
    revalidatePath("/admin/shipping");
    return { ok: true, rate: newRate };
  }
}

/**
 * Admin: Update an existing shipping rate
 */
export async function updateShippingRateAction(
  id: string,
  payload: {
    priceNaira?: number;
    freeShippingThresholdNaira?: number | null;
    estimatedMinDays?: number | null;
    estimatedMaxDays?: number | null;
    isActive?: boolean;
  },
): Promise<{ ok: boolean; message?: string }> {
  await assertAdmin();
  try {
    const supabase = createServiceClient();
    const updateData: any = { updated_at: new Date().toISOString() };

    if (payload.priceNaira !== undefined) {
      updateData.price_kobo = Math.round(Number(payload.priceNaira) * 100);
    }
    if (payload.freeShippingThresholdNaira !== undefined) {
      updateData.free_shipping_threshold_kobo = payload.freeShippingThresholdNaira
        ? Math.round(Number(payload.freeShippingThresholdNaira) * 100)
        : null;
    }
    if (payload.estimatedMinDays !== undefined) {
      updateData.estimated_min_days = payload.estimatedMinDays;
    }
    if (payload.estimatedMaxDays !== undefined) {
      updateData.estimated_max_days = payload.estimatedMaxDays;
    }
    if (payload.isActive !== undefined) {
      updateData.is_active = payload.isActive;
    }

    const { error } = await supabase
      .from("shipping_rates")
      .update(updateData)
      .eq("id", id);

    if (!error) {
      revalidatePath("/admin/shipping");
      revalidatePath("/checkout");
      return { ok: true };
    }

    // Fallback update in store_settings
    activeShippingRates = activeShippingRates.map((r) =>
      r.id === id ? { ...r, ...updateData } : r,
    );
    await supabase.from("store_settings").upsert({
      key: "shipping_rates_config",
      value: activeShippingRates,
      updated_at: new Date().toISOString(),
    });

    revalidatePath("/admin/shipping");
    revalidatePath("/checkout");
    return { ok: true };
  } catch {
    activeShippingRates = activeShippingRates.map((r) =>
      r.id === id ? { ...r, ...payload } : r,
    );
    revalidatePath("/admin/shipping");
    return { ok: true };
  }
}

/**
 * Admin: Delete a shipping rate
 */
export async function deleteShippingRateAction(
  id: string,
): Promise<{ ok: boolean; message?: string }> {
  await assertAdmin();
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("shipping_rates").delete().eq("id", id);

    if (!error) {
      revalidatePath("/admin/shipping");
      revalidatePath("/checkout");
      return { ok: true };
    }

    activeShippingRates = activeShippingRates.filter((r) => r.id !== id);
    await supabase.from("store_settings").upsert({
      key: "shipping_rates_config",
      value: activeShippingRates,
      updated_at: new Date().toISOString(),
    });

    revalidatePath("/admin/shipping");
    revalidatePath("/checkout");
    return { ok: true };
  } catch {
    activeShippingRates = activeShippingRates.filter((r) => r.id !== id);
    revalidatePath("/admin/shipping");
    return { ok: true };
  }
}

/**
 * Admin: Add delivery zone with direct price and auto-synced shipping rate
 */
export async function createDeliveryZoneAction(payload: {
  stateId: string;
  lgaId?: string | null;
  name: string;
  aliases?: string[];
  priceNaira?: number;
  estimatedDays?: string;
}): Promise<{ ok: boolean; zone?: DeliveryZone; message?: string }> {
  await assertAdmin();
  if (!payload.name?.trim()) {
    return { ok: false, message: "Zone name is required." };
  }

  const priceKobo =
    payload.priceNaira !== undefined && !isNaN(Number(payload.priceNaira))
      ? Math.round(Number(payload.priceNaira) * 100)
      : 200000;

  const newZone: DeliveryZone = {
    id: `zone_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    state_id: payload.stateId,
    lga_id: payload.lgaId || null,
    name: payload.name.trim(),
    aliases: payload.aliases || [],
    base_price_kobo: priceKobo,
    estimated_days: payload.estimatedDays?.trim() || "1-2 business days",
    is_active: true,
  };

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("delivery_zones")
      .insert({
        state_id: newZone.state_id,
        lga_id: newZone.lga_id,
        name: newZone.name,
        aliases: newZone.aliases,
        base_price_kobo: newZone.base_price_kobo,
        estimated_days: newZone.estimated_days,
        is_active: true,
      })
      .select()
      .maybeSingle();

    const createdZone = !error && data ? data : newZone;

    // Immediately create corresponding shipping_rate for this zone
    await supabase.from("shipping_rates").insert({
      shipping_method_id: "own_delivery",
      state_id: createdZone.state_id,
      lga_id: createdZone.lga_id,
      delivery_zone_id: createdZone.id,
      price_kobo: priceKobo,
      estimated_min_days: 1,
      estimated_max_days: 2,
      is_active: true,
    });

    customDeliveryZones = [createdZone, ...customDeliveryZones];
    await supabase.from("store_settings").upsert({
      key: "delivery_zones_config",
      value: customDeliveryZones,
      updated_at: new Date().toISOString(),
    });

    revalidatePath("/admin/shipping");
    revalidatePath("/checkout");
    return { ok: true, zone: createdZone };
  } catch {
    customDeliveryZones = [newZone, ...customDeliveryZones];
    revalidatePath("/admin/shipping");
    revalidatePath("/checkout");
    return { ok: true, zone: newZone };
  }
}

/**
 * Admin: Update delivery zone and its shipping rate
 */
export async function updateDeliveryZoneAction(
  id: string,
  payload: {
    name?: string;
    aliases?: string[];
    priceNaira?: number;
    estimatedDays?: string;
    isActive?: boolean;
    stateId?: string;
    lgaId?: string | null;
  },
): Promise<{ ok: boolean; message?: string }> {
  await assertAdmin();
  try {
    const supabase = createServiceClient();
    const updateData: any = { updated_at: new Date().toISOString() };
    if (payload.name !== undefined) updateData.name = payload.name;
    if (payload.aliases !== undefined) updateData.aliases = payload.aliases;
    if (payload.stateId !== undefined) updateData.state_id = payload.stateId;
    if (payload.lgaId !== undefined) updateData.lga_id = payload.lgaId;
    if (payload.estimatedDays !== undefined) updateData.estimated_days = payload.estimatedDays;
    if (payload.isActive !== undefined) updateData.is_active = payload.isActive;
    if (payload.priceNaira !== undefined) {
      updateData.base_price_kobo = Math.round(Number(payload.priceNaira) * 100);
    }

    await supabase.from("delivery_zones").update(updateData).eq("id", id);

    // Sync shipping_rates for this zone if price or active status changed
    if (payload.priceNaira !== undefined || payload.isActive !== undefined) {
      const rateUpdate: any = {};
      if (payload.priceNaira !== undefined) {
        rateUpdate.price_kobo = Math.round(Number(payload.priceNaira) * 100);
      }
      if (payload.isActive !== undefined) {
        rateUpdate.is_active = payload.isActive;
      }
      await supabase
        .from("shipping_rates")
        .update(rateUpdate)
        .eq("delivery_zone_id", id);
    }

    customDeliveryZones = customDeliveryZones.map((z) =>
      z.id === id ? { ...z, ...updateData } : z,
    );
    await supabase.from("store_settings").upsert({
      key: "delivery_zones_config",
      value: customDeliveryZones,
      updated_at: new Date().toISOString(),
    });

    revalidatePath("/admin/shipping");
    revalidatePath("/checkout");
    return { ok: true };
  } catch {
    customDeliveryZones = customDeliveryZones.map((z) =>
      z.id === id ? { ...z, ...payload } : z,
    );
    revalidatePath("/admin/shipping");
    revalidatePath("/checkout");
    return { ok: true };
  }
}

/**
 * Admin: Delete delivery zone and all its rates
 */
export async function deleteDeliveryZoneAction(
  id: string,
): Promise<{ ok: boolean; message?: string }> {
  await assertAdmin();
  try {
    const supabase = createServiceClient();
    await supabase.from("shipping_rates").delete().eq("delivery_zone_id", id);
    await supabase.from("delivery_zones").delete().eq("id", id);

    customDeliveryZones = customDeliveryZones.filter((z) => z.id !== id);
    await supabase.from("store_settings").upsert({
      key: "delivery_zones_config",
      value: customDeliveryZones,
      updated_at: new Date().toISOString(),
    });

    revalidatePath("/admin/shipping");
    revalidatePath("/checkout");
    return { ok: true };
  } catch {
    customDeliveryZones = customDeliveryZones.filter((z) => z.id !== id);
    revalidatePath("/admin/shipping");
    revalidatePath("/checkout");
    return { ok: true };
  }
}

/**
 * Fetch all pickup store locations
 */
export async function getPickupLocations(onlyActive = true): Promise<PickupLocation[]> {
  try {
    const supabase = createServiceClient();
    let query = supabase
      .from("pickup_locations")
      .select("*")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (onlyActive) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      return data;
    }
  } catch {
    // Fall through
  }

  try {
    const supabase = createServiceClient();
    const { data: settingsData } = await supabase
      .from("store_settings")
      .select("value")
      .eq("key", "pickup_locations_config")
      .maybeSingle();

    if (Array.isArray(settingsData?.value) && settingsData.value.length > 0) {
      activePickupLocations = settingsData.value as PickupLocation[];
      return onlyActive
        ? activePickupLocations.filter((l) => l.is_active)
        : activePickupLocations;
    }
  } catch {}

  return onlyActive
    ? activePickupLocations.filter((l) => l.is_active)
    : activePickupLocations;
}

/**
 * Admin: Create a pickup store location
 */
export async function createPickupLocationAction(payload: {
  name: string;
  address: string;
  landmark?: string | null;
  city: string;
  stateId?: string | null;
  phone?: string | null;
  email?: string | null;
  operatingHours?: string | null;
  instructions?: string | null;
  isActive?: boolean;
}): Promise<{ ok: boolean; location?: PickupLocation; message?: string }> {
  await assertAdmin();
  if (!payload.name?.trim()) {
    return { ok: false, message: "Store name is required." };
  }
  if (!payload.address?.trim()) {
    return { ok: false, message: "Store address is required." };
  }
  if (!payload.city?.trim()) {
    return { ok: false, message: "Store city is required." };
  }

  const newLoc: PickupLocation = {
    id: `store_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: payload.name.trim(),
    address: payload.address.trim(),
    landmark: payload.landmark?.trim() || null,
    city: payload.city.trim(),
    state_id: payload.stateId || null,
    phone: payload.phone?.trim() || null,
    email: payload.email?.trim() || null,
    operating_hours: payload.operatingHours?.trim() || "Mon–Sat 9:00 AM – 7:00 PM",
    instructions:
      payload.instructions?.trim() ||
      "Ready for collection within 24 hours of payment. Please bring your Order ID.",
    is_active: payload.isActive ?? true,
    display_order: activePickupLocations.length,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("pickup_locations")
      .insert({
        name: newLoc.name,
        address: newLoc.address,
        landmark: newLoc.landmark,
        city: newLoc.city,
        state_id: newLoc.state_id,
        phone: newLoc.phone,
        email: newLoc.email,
        operating_hours: newLoc.operating_hours,
        instructions: newLoc.instructions,
        is_active: newLoc.is_active,
        display_order: newLoc.display_order,
      })
      .select()
      .maybeSingle();

    if (!error && data) {
      revalidatePath("/admin/shipping");
      revalidatePath("/checkout");
      return { ok: true, location: data };
    }

    activePickupLocations = [...activePickupLocations, newLoc];
    await supabase.from("store_settings").upsert({
      key: "pickup_locations_config",
      value: activePickupLocations,
      updated_at: new Date().toISOString(),
    });

    revalidatePath("/admin/shipping");
    revalidatePath("/checkout");
    return { ok: true, location: newLoc };
  } catch {
    activePickupLocations = [...activePickupLocations, newLoc];
    revalidatePath("/admin/shipping");
    revalidatePath("/checkout");
    return { ok: true, location: newLoc };
  }
}

/**
 * Admin: Update a pickup store location
 */
export async function updatePickupLocationAction(
  id: string,
  payload: Partial<PickupLocation>,
): Promise<{ ok: boolean; message?: string }> {
  await assertAdmin();
  try {
    const supabase = createServiceClient();
    const updateData: any = { updated_at: new Date().toISOString() };
    if (payload.name !== undefined) updateData.name = payload.name;
    if (payload.address !== undefined) updateData.address = payload.address;
    if (payload.landmark !== undefined) updateData.landmark = payload.landmark;
    if (payload.city !== undefined) updateData.city = payload.city;
    if (payload.state_id !== undefined) updateData.state_id = payload.state_id;
    if (payload.phone !== undefined) updateData.phone = payload.phone;
    if (payload.email !== undefined) updateData.email = payload.email;
    if (payload.operating_hours !== undefined) updateData.operating_hours = payload.operating_hours;
    if (payload.instructions !== undefined) updateData.instructions = payload.instructions;
    if (payload.is_active !== undefined) updateData.is_active = payload.is_active;

    await supabase.from("pickup_locations").update(updateData).eq("id", id);

    activePickupLocations = activePickupLocations.map((l) =>
      l.id === id ? { ...l, ...updateData } : l,
    );
    await supabase.from("store_settings").upsert({
      key: "pickup_locations_config",
      value: activePickupLocations,
      updated_at: new Date().toISOString(),
    });

    revalidatePath("/admin/shipping");
    revalidatePath("/checkout");
    return { ok: true };
  } catch {
    activePickupLocations = activePickupLocations.map((l) =>
      l.id === id ? { ...l, ...payload } : l,
    );
    revalidatePath("/admin/shipping");
    revalidatePath("/checkout");
    return { ok: true };
  }
}

/**
 * Admin: Delete a pickup store location
 */
export async function deletePickupLocationAction(
  id: string,
): Promise<{ ok: boolean; message?: string }> {
  await assertAdmin();
  try {
    const supabase = createServiceClient();
    await supabase.from("pickup_locations").delete().eq("id", id);

    activePickupLocations = activePickupLocations.filter((l) => l.id !== id);
    await supabase.from("store_settings").upsert({
      key: "pickup_locations_config",
      value: activePickupLocations,
      updated_at: new Date().toISOString(),
    });

    revalidatePath("/admin/shipping");
    revalidatePath("/checkout");
    return { ok: true };
  } catch {
    activePickupLocations = activePickupLocations.filter((l) => l.id !== id);
    revalidatePath("/admin/shipping");
    revalidatePath("/checkout");
    return { ok: true };
  }
}

/**
 * Admin: Update shipment information (rider assignment, courier tracking, shipment status)
 */
export async function updateOrderShipmentAction(payload: {
  orderId: string;
  shipmentStatus?: ShipmentStatus;
  assignedRiderName?: string;
  assignedRiderPhone?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  courierProvider?: string;
  notes?: string;
}): Promise<{ ok: boolean; message?: string }> {
  await assertAdmin();
  try {
    const supabase = createServiceClient();
    const updateData: any = {};

    if (payload.shipmentStatus) updateData.shipment_status = payload.shipmentStatus;
    if (payload.assignedRiderName !== undefined) updateData.assigned_rider_name = payload.assignedRiderName;
    if (payload.assignedRiderPhone !== undefined) updateData.assigned_rider_phone = payload.assignedRiderPhone;
    if (payload.trackingNumber !== undefined) updateData.tracking_number = payload.trackingNumber;
    if (payload.trackingUrl !== undefined) updateData.tracking_url = payload.trackingUrl;
    if (payload.courierProvider !== undefined) updateData.courier_provider = payload.courierProvider;

    await supabase.from("orders").update(updateData).eq("id", payload.orderId);

    // Record shipment log
    if (payload.shipmentStatus || payload.notes) {
      await supabase.from("shipment_logs").insert({
        order_id: payload.orderId,
        status: payload.shipmentStatus || "updated",
        notes: payload.notes || `Shipment updated: ${payload.shipmentStatus || "info modified"}`,
      });
    }

    revalidatePath("/admin/orders");
    revalidatePath("/track");
    return { ok: true };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Failed to update shipment." };
  }
}
