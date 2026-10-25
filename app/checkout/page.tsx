import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { StorefrontHeader } from "@/components/storefront-header";
import { CheckoutView } from "@/features/checkout/components/checkout-view";
import { getPaymentMethodsConfig } from "@/features/admin/actions/payments";
import { getStates, getLgas, getDeliveryZones } from "@/features/shipping/actions";

export const metadata: Metadata = {
  title: "Checkout — Boojy",
  description: "Place your Boojy order as a guest — no account needed.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CheckoutPage() {
  const [paymentMethods, states, lgas, deliveryZones] = await Promise.all([
    getPaymentMethodsConfig(),
    getStates(),
    getLgas(""),
    getDeliveryZones(""),
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
        />
      </main>
      <SiteFooter />
    </div>
  );
}
