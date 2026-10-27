import { Suspense } from "react";
import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { StorefrontHeader } from "@/components/storefront-header";
import { ProductDetail, ProductDetailSkeleton } from "@/features/catalog/components/product-detail";
import { createClient } from "@/lib/supabase/server";
import { getProductById } from "@/features/catalog/lib/catalog";

import { buildPageMetadata } from "@/lib/seo";

// Live product data (stock, price) + cookies in generateMetadata mean this
// route must render per request — never statically prerender it.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const product = await getProductById(supabase, id);

  if (!product) {
    return buildPageMetadata({
      title: "Product Not Found",
      description: "The requested product is not available in the Boojy catalog.",
      path: `/products/${id}`,
      noIndex: true,
    });
  }

  const primaryImage = product.image_url || "/opengraph-image.png";

  return buildPageMetadata({
    title: product.name,
    description:
      product.description ||
      `Shop ${product.name} at Boojy. Curated Nigerian streetwear and luxury apparel.`,
    path: `/products/${id}`,
    image: primaryImage,
    imageAlt: product.name,
    type: "article",
  });
}

export default function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Pass the params promise unresolved into the Suspense boundary so the shell
  // streams immediately and only the product section waits.
  return (
    <div className="flex min-h-screen flex-col">
      <StorefrontHeader />
      <main className="flex-1">
        <Suspense fallback={<ProductDetailSkeleton />}>
          <ProductDetail params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
