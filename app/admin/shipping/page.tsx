import type { Metadata } from "next";
import {
  getShippingRates,
  getShippingMethods,
  getStates,
  getLgas,
  getDeliveryZones,
} from "@/features/shipping/actions";
import { ShippingManager } from "@/features/admin/components/shipping-manager";

export const metadata: Metadata = {
  title: "Shipping & Delivery Rates — Boojy Admin",
  description: "Configure Nigerian delivery zones, shipping rates, and dispatch methods.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminShippingPage() {
  const [rates, methods, states, lgas, deliveryZones] = await Promise.all([
    getShippingRates(),
    getShippingMethods(),
    getStates(),
    getLgas(""),
    getDeliveryZones(""),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          Shipping & Delivery Management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage Nigerian shipping rates across 3 tiers (State, LGA, City/Zone), configure delivery zones, and control customer checkout shipping fees.
        </p>
      </div>

      <ShippingManager
        initialRates={rates}
        methods={methods}
        states={states}
        lgas={lgas}
        deliveryZones={deliveryZones}
      />
    </div>
  );
}
