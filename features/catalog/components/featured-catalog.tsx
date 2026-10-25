import { Fragment } from "react";
import { createClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";
import {
  getFeaturedCategories,
  getAllActiveProducts,
  type Category,
  type Product,
} from "@/features/catalog/lib/catalog";
import { ProductCard } from "@/features/catalog/components/product-card";
import { PromoAdCard } from "@/features/catalog/components/promo-ad-card";
import { getPromoConfig } from "@/features/admin/actions/promotions";
import { getCategoryOrder } from "@/features/catalog/lib/category-order.server";
import { sortCategoriesByOrder } from "@/features/catalog/lib/category-order";

export async function FeaturedCatalog() {
  if (!hasEnvVars) {
    return <SetupHint />;
  }

  const supabase = await createClient();
  const [rawCategories, products, promoConfig, categoryOrder] = await Promise.all([
    getFeaturedCategories(supabase),
    getAllActiveProducts(supabase),
    getPromoConfig(),
    getCategoryOrder(),
  ]);

  const categories = sortCategoriesByOrder(rawCategories, categoryOrder);

  if (products.length === 0) {
    return <EmptyCatalog />;
  }

  // Group products into each category respecting the custom display order
  const categorySections: { category: Category; products: Product[] }[] = [];
  const categorizedProductIds = new Set<string>();

  for (const category of categories) {
    const matching = products.filter((p) => {
      const catIds =
        p.category_ids && p.category_ids.length > 0
          ? p.category_ids
          : p.category_id
            ? [p.category_id]
            : [];
      return catIds.includes(category.id);
    });

    if (matching.length > 0) {
      categorySections.push({ category, products: matching });
      matching.forEach((p) => categorizedProductIds.add(p.id));
    }
  }

  // Any remaining active products not assigned to above categories
  const uncategorized = products.filter((p) => !categorizedProductIds.has(p.id));

  return (
    <div className="site-container py-14 space-y-16 sm:space-y-20">
      {/* Category anchor pills */}
      {categories.length > 0 && (
        <section aria-label="Category quick navigation" className="-mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-xs uppercase tracking-wider text-muted-foreground mr-1">
              Explore:
            </span>
            {categories.map((category) => (
              <a
                key={category.id}
                href={`#category-${category.slug}`}
                className="inline-flex items-center rounded-full border border-border bg-card px-4 py-2 text-xs sm:text-sm font-medium transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
              >
                {category.name}
              </a>
            ))}
          </div>
        </section>
      )}

      {/* Categorized Sections */}
      {categorySections.map(({ category, products: catProducts }, secIdx) => {
        const isFirst = secIdx === 0;
        return (
          <section
            key={category.id}
            id={`category-${category.slug}`}
            aria-labelledby={`heading-${category.slug}`}
            className="scroll-mt-24 space-y-6"
          >
            <div className="border-b border-border/40 pb-4">
              <h2
                id={`heading-${category.slug}`}
                className="font-display text-2xl sm:text-3xl font-bold uppercase tracking-tight"
              >
                {category.name}
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {catProducts.map((product, idx) => (
                <Fragment key={product.id}>
                  {isFirst && promoConfig.enabled && idx === promoConfig.gridPosition && (
                    <PromoAdCard config={promoConfig} />
                  )}
                  <ProductCard product={product} categories={categories} />
                </Fragment>
              ))}
              {isFirst &&
                promoConfig.enabled &&
                catProducts.length <= promoConfig.gridPosition && (
                  <PromoAdCard config={promoConfig} />
                )}
            </div>
          </section>
        );
      })}

      {/* Fallback section for uncategorized products, if any */}
      {uncategorized.length > 0 && (
        <section aria-labelledby="heading-uncategorized" className="space-y-6">
          <div className="border-b border-border/40 pb-4">
            <h2
              id="heading-uncategorized"
              className="font-display text-2xl sm:text-3xl font-bold uppercase tracking-tight"
            >
              More Drops
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {uncategorized.map((product) => (
              <ProductCard key={product.id} product={product} categories={categories} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function FeaturedCatalogSkeleton() {
  return (
    <div className="site-container py-14 space-y-16">
      {/* Category pills skeleton */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-9 w-24 animate-shimmer rounded-full" />
        ))}
      </div>
      {/* Sections skeleton */}
      {Array.from({ length: 2 }).map((_, secIdx) => (
        <div key={secIdx} className="space-y-6">
          <div className="border-b border-border/40 pb-4">
            <div className="h-8 w-44 animate-shimmer rounded-md" />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="aspect-square animate-shimmer rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SetupHint() {
  return (
    <div className="site-container py-14">
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm font-medium">The catalog is waiting for Supabase.</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Copy `.env.example` to `.env.local`, add your Supabase project keys, and
          apply the migrations in `supabase/migrations/` to load the seed catalog.
        </p>
      </div>
    </div>
  );
}

function EmptyCatalog() {
  return (
    <div className="site-container py-14">
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <p className="text-sm font-medium">No products yet.</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Once the catalog has Products, they will appear here.
        </p>
      </div>
    </div>
  );
}
