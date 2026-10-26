import type { Metadata } from "next";
import {
  getShippingRates,
  getShippingMethods,
  getStates,
  getLgas,
  getDeliveryZones,
  getPickupLocations,
} from "@/features/shipping/actions";
import { ShippingManager } from "@/features/admin/components/shipping-manager";

export const metadata: Metadata = {
  title: "Delivery & Pickup — Boojy Admin",
  description: "Manage delivery fees and store pickup locations.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminShippingPage() {
  const [rates, methods, states, lgas, deliveryZones, pickupLocations] = await Promise.all([
    getShippingRates(),
    getShippingMethods(),
    getStates(),
    getLgas(),
    getDeliveryZones(),
    getPickupLocations(false),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Delivery & Pickup
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage delivery fees and store pickup locations.
        </p>
      </div>

      <ShippingManager
        initialRates={rates}
        methods={methods}
        states={states}
        lgas={lgas}
        deliveryZones={deliveryZones}
        initialPickupLocations={pickupLocations}
      />
    </div>
  );
}
