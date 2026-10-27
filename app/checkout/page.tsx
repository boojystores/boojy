import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { StorefrontHeader } from "@/components/storefront-header";
import { CheckoutView } from "@/features/checkout/components/checkout-view";
import { getPaymentMethodsConfig } from "@/features/admin/actions/payments";
import { getStates, getLgas, getDeliveryZones, getPickupLocations } from "@/features/shipping/actions";

import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Checkout",
  description: "Secure guest checkout for your Boojy order.",
  path: "/checkout",
  noIndex: true,
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CheckoutPage() {
  const [paymentMethods, states, lgas, deliveryZones, pickupLocations] = await Promise.all([
    getPaymentMethodsConfig(),
    getStates(true), // only states with active shipping rates / zones
    getLgas(undefined, true), // only deliverable LGAs
    getDeliveryZones(),
    getPickupLocations(true),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <StorefrontHeader />
      <main className="flex-1">
        <CheckoutView
          initialPaymentMethods={paymentMethods}
          initialStates={states}
          initialLgas={lgas}
          initialDeliveryZones={deliveryZones}
          initialPickupLocations={pickupLocations}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
