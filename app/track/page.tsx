import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { StorefrontHeader } from "@/components/storefront-header";
import { TrackOrderForm } from "@/features/tracking/components/track-order-form";

import { buildPageMetadata, getBreadcrumbJsonLd } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Track Order",
  description: "Track your Boojy order status and real-time shipment updates using your order number.",
  path: "/track",
});

export default function TrackOrderPage() {
  const breadcrumbsSchema = getBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Track Order", path: "/track" },
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsSchema) }}
      />
      <StorefrontHeader />
      <main className="flex-1">
        <div className="site-container py-10">
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold tracking-tight">
              Track your order
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your order number to view the current status and details.
            </p>
          </div>
          <TrackOrderForm />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
