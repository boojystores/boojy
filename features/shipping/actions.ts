"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import {
  BUILTIN_STATES,
  BUILTIN_LGAS,
  BUILTIN_DELIVERY_ZONES,
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

/**
 * Fetch all active Nigerian states
 */
export async function getStates(): Promise<NigerianState[]> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("states")
      .select("id, name, code, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (!error && data && data.length > 0) {
      return data;
    }
  } catch {
    // Fall back to built-in dataset
  }
  return BUILTIN_STATES;
}

/**
 * Fetch active LGAs for a given state
 */
export async function getLgas(stateId: string): Promise<NigerianLga[]> {
  if (!stateId) return [];

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("lgas")
      .select("id, state_id, name, code, is_active")
      .eq("state_id", stateId)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (!error && data && data.length > 0) {
      return data;
    }
  } catch {
    // Fall back to built-in dataset
  }

  // Fallback matching by stateId
  return BUILTIN_LGAS.filter(
    (l) => l.state_id === stateId || l.state_id.endsWith(stateId.slice(-4)),
  );
}

/**
 * Fetch active delivery zones / cities for a state and optional LGA
 */
export async function getDeliveryZones(
  stateId: string,
  lgaId?: string | null,
): Promise<DeliveryZone[]> {
  if (!stateId) return [];

  try {
    const supabase = createServiceClient();
    let query = supabase
      .from("delivery_zones")
      .select("id, state_id, lga_id, name, aliases, is_active")
      .eq("state_id", stateId)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (lgaId) {
      query = query.or(`lga_id.is.null,lga_id.eq.${lgaId}`);
    }

    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      return data;
    }
  } catch {
    // Fall back
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
  const [methods, rates] = await Promise.all([
    getShippingMethods(),
    getShippingRates(),
  ]);

  return calculateAvailableShippingOptions(methods, rates, request);
}

/**
 * Admin: Add a new shipping rate
 */
export async function createShippingRateAction(payload: {
  shippingMethodId: string;
  stateId: string;
  lgaId?: string | null;
  deliveryZoneId?: string | null;
  priceNaira: number;
  freeShippingThresholdNaira?: number | null;
  estimatedMinDays?: number | null;
  estimatedMaxDays?: number | null;
  isActive?: boolean;
}): Promise<{ ok: boolean; message?: string; rate?: ShippingRate }> {
  const priceKobo = Math.round(Number(payload.priceNaira) * 100);
  if (isNaN(priceKobo) || priceKobo < 0) {
    return { ok: false, message: "Invalid delivery price. Must be 0 or greater." };
  }

  const freeKobo = payload.freeShippingThresholdNaira
    ? Math.round(Number(payload.freeShippingThresholdNaira) * 100)
    : null;

  const scope = payload.deliveryZoneId
    ? "zone"
    : payload.lgaId
      ? "lga"
      : "state";

  const newRate: ShippingRate = {
    id: `rate_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    shipping_method_id: payload.shippingMethodId,
    state_id: payload.stateId,
    lga_id: payload.lgaId || null,
    delivery_zone_id: payload.deliveryZoneId || null,
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
 * Admin: Add delivery zone
 */
export async function createDeliveryZoneAction(payload: {
  stateId: string;
  lgaId?: string | null;
  name: string;
  aliases?: string[];
}): Promise<{ ok: boolean; zone?: DeliveryZone; message?: string }> {
  if (!payload.name?.trim()) {
    return { ok: false, message: "Zone name is required." };
  }

  const newZone: DeliveryZone = {
    id: `zone_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    state_id: payload.stateId,
    lga_id: payload.lgaId || null,
    name: payload.name.trim(),
    aliases: payload.aliases || [],
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
        is_active: true,
      })
      .select()
      .maybeSingle();

    if (!error && data) {
      revalidatePath("/admin/shipping");
      return { ok: true, zone: data };
    }

    customDeliveryZones = [newZone, ...customDeliveryZones];
    await supabase.from("store_settings").upsert({
      key: "delivery_zones_config",
      value: customDeliveryZones,
      updated_at: new Date().toISOString(),
    });

    revalidatePath("/admin/shipping");
    return { ok: true, zone: newZone };
  } catch {
    customDeliveryZones = [newZone, ...customDeliveryZones];
    revalidatePath("/admin/shipping");
    return { ok: true, zone: newZone };
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
