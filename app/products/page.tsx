import { Suspense } from "react";
import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { StorefrontHeader } from "@/components/storefront-header";
import { CatalogGrid, CatalogGridSkeleton } from "@/features/catalog/components/catalog-grid";
import type { ProductsSearchParams } from "@/features/catalog/lib/catalog";

import { buildPageMetadata, getBreadcrumbJsonLd } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<ProductsSearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  const q = typeof params?.q === "string" ? params.q.trim() : "";
  const cat = typeof params?.category === "string" ? params.category.trim() : "";

  let title = "Products & Collections";
  let description =
    "Browse the Boojy catalog — search, filter by category, and discover curated streetwear apparel and luxury essentials.";

  if (q) {
    title = `Search results for "${q}"`;
    description = `Explore streetwear and apparel results for "${q}" at Boojy.`;
  } else if (cat) {
    const formattedCat = cat
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    title = `${formattedCat} Collection`;
    description = `Shop luxury ${formattedCat} streetwear apparel, oversized fits, and essentials from Boojy.`;
  }

  return buildPageMetadata({
    title,
    description,
    path: "/products",
  });
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<ProductsSearchParams>;
}) {
  const breadcrumbsSchema = getBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Products", path: "/products" },
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsSchema) }}
      />
      <StorefrontHeader />
      <main className="flex-1">
        <Suspense fallback={<CatalogGridSkeleton />}>
          <CatalogGrid searchParams={searchParams} />
        </Suspense>
      </main>
      <SiteFooter />
    </div>
  );
}
