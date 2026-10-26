/**
 * Shipping & Delivery System Types
 */

export type ShippingMethodType = "own_delivery" | "courier" | "pickup";

export type ShipmentStatus =
  | "pending"
  | "pending_assignment"
  | "assigned"
  | "dispatched"
  | "delivered"
  | "failed"
  | "cancelled";

export interface NigerianState {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface NigerianLga {
  id: string;
  state_id: string;
  name: string;
  code?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface DeliveryZone {
  id: string;
  state_id: string;
  lga_id?: string | null;
  name: string;
  aliases?: string[];
  base_price_kobo?: number | null;
  estimated_days?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PickupLocation {
  id: string;
  name: string;
  address: string;
  landmark?: string | null;
  city: string;
  state_id?: string | null;
  phone?: string | null;
  email?: string | null;
  operating_hours?: string | null;
  instructions?: string | null;
  is_active: boolean;
  display_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface ShippingMethod {
  id: string;
  name: string;
  method_type: ShippingMethodType;
  provider_id?: string | null;
  description?: string | null;
  estimated_min_days: number;
  estimated_max_days: number;
  is_active: boolean;
  display_order: number;
  created_at?: string;
  updated_at?: string;
}

export type PricingScope = "state" | "lga" | "zone";

export interface ShippingRate {
  id: string;
  shipping_method_id: string;
  shipping_method?: ShippingMethod;
  state_id: string;
  state?: NigerianState;
  lga_id?: string | null;
  lga?: NigerianLga;
  delivery_zone_id?: string | null;
  delivery_zone?: DeliveryZone;
  price_kobo: number;
  free_shipping_threshold_kobo?: number | null;
  estimated_min_days?: number | null;
  estimated_max_days?: number | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  // Computed / UI helper
  scope?: PricingScope;
}

export interface ShippingCalculationRequest {
  stateId: string;
  lgaId?: string | null;
  deliveryZoneId?: string | null;
  shippingMethodId?: string;
  subtotalKobo?: number;
}

export interface ShippingOption {
  methodId: string;
  methodName: string;
  methodType: ShippingMethodType;
  description: string;
  rateId: string;
  priceKobo: number;
  priceNaira: number;
  isFree: boolean;
  estimatedMinDays: number;
  estimatedMaxDays: number;
  scope: PricingScope;
}

export interface ShippingCalculationResponse {
  ok: boolean;
  available: boolean;
  options: ShippingOption[];
  selectedOption?: ShippingOption;
  message?: string;
}

export interface OrderDeliverySnapshot {
  recipientName: string;
  recipientPhone: string;
  shippingMethodId: string;
  shippingMethodName: string;
  shippingFeeKobo: number;
  shippingFeeNaira: number;
  stateId: string;
  stateName: string;
  lgaId?: string | null;
  lgaName?: string | null;
  deliveryZoneId?: string | null;
  cityName?: string | null;
  streetAddress: string;
  deliveryInstructions?: string | null;
  shipmentStatus: ShipmentStatus;
  assignedRiderName?: string | null;
  assignedRiderPhone?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  courierProvider?: string | null;
}
