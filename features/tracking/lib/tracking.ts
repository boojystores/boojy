import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentMethod } from "@/features/checkout/lib/checkout";

export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "shipped",
  "completed",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  shipped: "Shipped",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const LIFECYCLE: Exclude<OrderStatus, "cancelled">[] = [
  "pending",
  "confirmed",
  "preparing",
  "shipped",
  "completed",
];

export type TrackingItem = {
  productName: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
};

export type OrderTrackingResult = {
  id?: string;
  orderNumber: string;
  status: OrderStatus;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentProvider?: string;
  paymentStatus?: string;
  paidAt?: string | null;
  deliveryAddress: string;
  createdAt: string;
  customerName: string;
  shippingFee?: number;
  shippingMethodName?: string;
  shipmentStatus?: string;
  assignedRiderName?: string;
  assignedRiderPhone?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  courierProvider?: string;
  items: TrackingItem[];
};

type TrackOrderRow = {
  id?: string;
  order_number: string;
  status: string;
  total_amount: number;
  payment_method: string;
  payment_provider?: string | null;
  payment_status?: string | null;
  paid_at?: string | null;
  delivery_address: string;
  created_at: string;
  customer_name: string;
  shipping_fee?: number | null;
  shipping_method_name?: string | null;
  shipment_status?: string | null;
  assigned_rider_name?: string | null;
  assigned_rider_phone?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  courier_provider?: string | null;
  items: {
    product_name: string;
    image_url: string | null;
    quantity: number;
    unit_price: number;
  }[] | null;
};

/**
 * Order tracking (ticket 14): looks up an order by number via the
 * `track_order` SECURITY DEFINER function. No auth required — the order
 * number is the only key. Returns null when no order matches.
 */
export async function trackOrder(
  client: SupabaseClient,
  orderNumber: string,
  email: string,
): Promise<OrderTrackingResult | null> {
  const trimmedOrder = orderNumber.trim().toUpperCase();
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedOrder || !trimmedEmail) return null;

  const { data, error } = await client.rpc("track_order", {
    p_order_number: trimmedOrder,
    p_email: trimmedEmail,
  });

  if (error || !data) return null;

  const row = data as TrackOrderRow | null;
  if (!row || !row.order_number) return null;

  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status as OrderStatus,
    totalAmount: Number(row.total_amount),
    paymentMethod: row.payment_method as PaymentMethod,
    paymentProvider: row.payment_provider || undefined,
    paymentStatus: row.payment_status || undefined,
    paidAt: row.paid_at,
    deliveryAddress: row.delivery_address,
    createdAt: row.created_at,
    customerName: row.customer_name,
    shippingFee: row.shipping_fee != null ? Number(row.shipping_fee) : undefined,
    shippingMethodName: row.shipping_method_name || undefined,
    shipmentStatus: row.shipment_status || undefined,
    assignedRiderName: row.assigned_rider_name || undefined,
    assignedRiderPhone: row.assigned_rider_phone || undefined,
    trackingNumber: row.tracking_number || undefined,
    trackingUrl: row.tracking_url || undefined,
    courierProvider: row.courier_provider || undefined,
    items: (row.items ?? []).map((item) => ({
      productName: item.product_name,
      imageUrl: item.image_url,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
    })),
  };
}
