import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";
import {
  getFeaturedCategories,
  getProductById,
  getRelatedProducts,
} from "@/features/catalog/lib/catalog";
import { ProductCard } from "@/features/catalog/components/product-card";
import { ProductView } from "@/features/catalog/components/product-view";
import { getProductJsonLd, getBreadcrumbJsonLd } from "@/lib/seo";

export async function ProductDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!hasEnvVars) {
    return <SetupHint />;
  }

  const { id } = await params;
  const supabase = await createClient();
  const product = await getProductById(supabase, id);

  if (!product) {
    notFound();
  }

  // Related products need the product's own category, so they are fetched
  // after the product resolves; categories resolve the slug for the chip.
  const [related, categories] = await Promise.all([
    getRelatedProducts(supabase, product.category_id, product.id),
    getFeaturedCategories(supabase),
  ]);

  const categoryName = categories.find((c) => c.id === product.category_id)?.name;
  const productSchema = getProductJsonLd({
    id: product.id,
    name: product.name,
    description: product.description,
    price: product.price,
    stockQuantity: product.stock_quantity,
    images: product.images && product.images.length > 0 ? product.images : [product.image_url],
    categoryName,
  });

  const breadcrumbSchema = getBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Products", path: "/products" },
    { name: product.name, path: `/products/${product.id}` },
  ]);

  return (
    <div className="w-full">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      {/* Main product visual and purchase experience matching reference style */}
      <ProductView product={product} categories={categories} />

      {/* Related products section with sharp corners */}
      {related.length > 0 && (
        <div className="border-t border-border/80 bg-background">
          <section aria-labelledby="related-products" className="site-container py-12 sm:py-16">
            <div className="mb-6 flex items-end justify-between gap-4">
              <h2
                id="related-products"
                className="text-base sm:text-lg font-bold uppercase tracking-wider text-foreground"
              >
                Related Products
              </h2>
              <Link
                href="/products"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
              >
                View all →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {related.map((prod) => (
                <ProductCard key={prod.id} product={prod} categories={categories} />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export function ProductDetailSkeleton() {
  return (
    <div className="site-container py-6 sm:py-10">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
        <div className="lg:col-span-7 flex flex-col gap-3">
          <div className="aspect-[4/5] sm:aspect-square w-full animate-shimmer rounded-none" />
          <div className="flex gap-2.5 pt-1">
            <div className="h-16 w-14 sm:h-18 sm:w-16 animate-shimmer rounded-none" />
            <div className="h-16 w-14 sm:h-18 sm:w-16 animate-shimmer rounded-none" />
          </div>
        </div>
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="space-y-2">
            <div className="h-8 w-3/4 animate-shimmer rounded-none" />
            <div className="h-6 w-32 animate-shimmer rounded-none" />
            <div className="h-4 w-48 animate-shimmer rounded-none" />
          </div>
          <div className="space-y-3 pt-1">
            <div className="flex gap-2.5">
              <div className="h-12 w-32 animate-shimmer rounded-none" />
              <div className="h-12 flex-1 animate-shimmer rounded-none" />
            </div>
          </div>
          <div className="h-4 w-52 animate-shimmer rounded-none" />
          <div className="h-20 w-full animate-shimmer rounded-none" />
        </div>
      </div>
    </div>
  );
}

function SetupHint() {
  return (
    <div className="site-container py-10">
      <div className="rounded-none border border-dashed border-border p-10 text-center">
        <p className="text-sm font-medium">The catalog is waiting for Supabase.</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Copy `.env.example` to `.env.local`, add your Supabase project keys, and
          apply the migrations in `supabase/migrations/` to load the seed catalog.
        </p>
      </div>
    </div>
  );
}
