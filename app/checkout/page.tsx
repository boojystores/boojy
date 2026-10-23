import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { StorefrontHeader } from "@/components/storefront-header";
import { CheckoutView } from "@/features/checkout/components/checkout-view";

export const metadata: Metadata = {
  title: "Checkout — Boojy",
  description: "Place your Boojy order as a guest — no account needed.",
};

export default function CheckoutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <StorefrontHeader />
      <main className="flex-1">
        <CheckoutView />
      </main>
      <SiteFooter />
    </div>
  );
}
