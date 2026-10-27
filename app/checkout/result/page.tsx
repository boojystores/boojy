import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { StorefrontHeader } from "@/components/storefront-header";
import { PaymentResultView } from "@/features/checkout/components/payment-result-view";

import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Payment Status",
  description: "Verification of your Boojy order payment.",
  path: "/checkout/result",
  noIndex: true,
});

export default async function CheckoutResultPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string; cancelled?: string }>;
}) {
  const { order_id, cancelled } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col">
      <StorefrontHeader />
      <main className="flex-1">
        <PaymentResultView
          orderId={order_id || ""}
          isCancelled={cancelled === "true" || cancelled === "1"}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
