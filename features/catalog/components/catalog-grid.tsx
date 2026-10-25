import Link from "next/link";
import { Fragment } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";
import {
  getFeaturedCategories,
  isValidSort,
  parseCategorySlugs,
  searchCatalog,
  type ProductsSearchParams,
} from "@/features/catalog/lib/catalog";
import { ProductCard } from "@/features/catalog/components/product-card";
import { PromoAdCard } from "@/features/catalog/components/promo-ad-card";
import { getPromoConfig } from "@/features/admin/actions/promotions";
import { CatalogToolbar } from "@/features/catalog/components/catalog-toolbar";
import { StickyCatalogToolbar } from "@/features/catalog/components/sticky-catalog-toolbar";

const PAGE_SIZE = 12;

/**
 * The `page` query param as a valid 1-based page number: missing, blank,
 * non-numeric, or below-1 values all fall back to 1.
 */
function toPage(raw: string | undefined): number {
  const page = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(page) && page >= 1 ? page : 1;
}

export async function CatalogGrid({
  searchParams,
}: {
  searchParams: Promise<ProductsSearchParams>;
}) {
  if (!hasEnvVars) {
    return <SetupHint />;
  }

  const params = await searchParams;
  const supabase = await createClient();
  // URL state maps 1:1 to the query: sort falls back to "newest", page to 1.
  const requestedPage = toPage(params.page);
  const sort = isValidSort(params.sort) ? params.sort : "featured";
  const stock =
    params.stock === "in-stock" || params.stock === "out-of-stock"
      ? params.stock
      : undefined;
  const minPrice =
    params.minPrice && !Number.isNaN(Number(params.minPrice))
      ? Number(params.minPrice)
      : undefined;
  const maxPrice =
    params.maxPrice && !Number.isNaN(Number(params.maxPrice))
      ? Number(params.maxPrice)
      : undefined;

  // Categories are needed both for the filter dropdown and to resolve the
  // `category` slugs (from the URL) into the ids the products table uses, so
  // they are fetched first and the search then scopes by categoryIds in one query.
  const categories = await getFeaturedCategories(supabase);
  const selectedSlugs = parseCategorySlugs(params.category);
  const activeCategories = categories.filter((c) => selectedSlugs.includes(c.slug));
  const categorySpecified = selectedSlugs.length > 0;

  // An unknown category slug in the URL is a real filter, just one that
  // matches nothing — render the empty state rather than silently dropping it.
  if (categorySpecified && activeCategories.length === 0) {
    return (
      <CatalogFrame
        categories={categories}
        totalCount={0}
        toolbar
        empty={
          <EmptyResults
            hasQuery={Boolean(params.q || stock || minPrice != null || maxPrice != null)}
            hasCategory={false}
            title="Those categories don't exist."
            description="The categories may have been renamed or removed. Try browsing all products instead."
          />
        }
      />
    );
  }

  const queryParams = {
    q: params.q,
    categoryIds: activeCategories.length > 0 ? activeCategories.map((c) => c.id) : undefined,
    sort,
    stock,
    minPrice,
    maxPrice,
    pageSize: PAGE_SIZE,
  };

  const result = await searchCatalog(supabase, {
    ...queryParams,
    page: requestedPage,
  });

  // A page number beyond the last page is a stale link/refresh — re-fetch at
  // the last page instead of showing a dead empty grid.
  const page = Math.min(requestedPage, result.totalPages);
  const clamped = page !== requestedPage;
  const effectiveResult = clamped
    ? await searchCatalog(supabase, {
        ...queryParams,
        page,
      })
    : result;
  const { products, totalPages } = effectiveResult;
  const promoConfig = await getPromoConfig();

  return (
    <CatalogFrame
      categories={categories}
      totalCount={effectiveResult.total}
      toolbar
      empty={
        products.length === 0 ? (
          <EmptyResults
            hasQuery={Boolean(params.q || stock || minPrice != null || maxPrice != null)}
            hasCategory={activeCategories.length > 0}
          />
        ) : undefined
      }
    >
      {products.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product, idx) => (
              <Fragment key={product.id}>
                {promoConfig.enabled && idx === promoConfig.gridPosition && (
                  <PromoAdCard config={promoConfig} />
                )}
                <ProductCard product={product} categories={categories} />
              </Fragment>
            ))}
            {promoConfig.enabled && products.length > 0 && products.length <= promoConfig.gridPosition && (
              <PromoAdCard config={promoConfig} />
            )}
          </div>
          {totalPages > 1 && (
            <CatalogPagination
              page={page}
              totalPages={totalPages}
              searchParams={params}
            />
          )}
        </>
      )}
    </CatalogFrame>
  );
}

function CatalogFrame({
  categories,
  totalCount = 0,
  toolbar = false,
  empty,
  children,
}: {
  categories: Awaited<ReturnType<typeof getFeaturedCategories>>;
  totalCount?: number;
  toolbar?: boolean;
  empty?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-full overflow-x-clip">
      {/* Upper header section matching the reference design */}
      <div className="w-full border-b border-border bg-background">
        <div className="px-6 py-8 sm:px-10 sm:py-14">
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground uppercase sm:text-5xl md:text-6xl">
            Products
          </h1>
        </div>
      </div>

      {/* Split toolbar bar with top/bottom border dividers running edge-to-edge */}
      {toolbar && (
        <StickyCatalogToolbar>
          <CatalogToolbar categories={categories} totalCount={totalCount} />
        </StickyCatalogToolbar>
      )}

      {/* Main product catalog grid or empty state */}
      <div className="site-container py-8 sm:py-12">
        {empty ? empty : children}
      </div>
    </div>
  );
}

function CatalogPagination({
  page,
  totalPages,
  searchParams,
}: {
  page: number;
  totalPages: number;
  searchParams: ProductsSearchParams;
}) {
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);

  function href(target: number) {
    // Rebuild the URL from the current filters, swapping in the target page.
    // Empty params and page 1 are omitted — page 1 is the implicit default.
    const urlParams = new URLSearchParams();
    if (searchParams.q) urlParams.set("q", searchParams.q);
    if (searchParams.category) urlParams.set("category", searchParams.category);
    if (isValidSort(searchParams.sort)) urlParams.set("sort", searchParams.sort);
    if (searchParams.stock) urlParams.set("stock", searchParams.stock);
    if (searchParams.minPrice) urlParams.set("minPrice", searchParams.minPrice);
    if (searchParams.maxPrice) urlParams.set("maxPrice", searchParams.maxPrice);
    if (target > 1) urlParams.set("page", String(target));
    const qs = urlParams.toString();
    return qs ? `/products?${qs}` : "/products";
  }

  const prev = page > 1 ? href(page - 1) : null;
  const next = page < totalPages ? href(page + 1) : null;

  return (
    <nav
      aria-label="Pagination"
      className="mt-10 flex items-center justify-center gap-1"
    >
      {prev ? (
        <Link
          href={prev}
          className="inline-flex h-9 items-center gap-1 px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Link>
      ) : (
        <span className="inline-flex h-9 cursor-not-allowed items-center gap-1 px-3 text-sm font-medium text-muted-foreground/40">
          <ChevronLeft className="h-4 w-4" />
          Previous
        </span>
      )}

      {pages.map((target) => {
        const active = target === page;
        return (
          <Link
            key={target}
            href={href(target)}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "inline-flex h-9 w-9 items-center justify-center bg-black text-sm font-semibold text-white"
                : "inline-flex h-9 w-9 items-center justify-center text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            }
          >
            {target}
          </Link>
        );
      })}

      {next ? (
        <Link
          href={next}
          className="inline-flex h-9 items-center gap-1 px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : (
        <span className="inline-flex h-9 cursor-not-allowed items-center gap-1 px-3 text-sm font-medium text-muted-foreground/40">
          Next
          <ChevronRight className="h-4 w-4" />
        </span>
      )}
    </nav>
  );
}

export function CatalogGridSkeleton() {
  return (
    <div className="w-full">
      <div className="w-full border-b border-border bg-background">
        <div className="px-6 py-10 sm:px-10 sm:py-14">
          <h1 className="font-display text-4xl font-bold tracking-tight text-foreground uppercase sm:text-5xl md:text-6xl">
            Products
          </h1>
        </div>
      </div>

      <div className="w-full border-b border-border bg-background">
        <div className="flex h-14 sm:h-16 w-full items-stretch justify-between">
          <div className="h-full w-36 sm:w-44 border-r border-border animate-shimmer" />
          <div className="h-full w-36 sm:w-44 border-l border-border animate-shimmer" />
        </div>
      </div>

      <div className="site-container py-8 sm:py-12">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="aspect-square animate-shimmer" />
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyResults({
  hasQuery,
  hasCategory,
  title,
  description,
}: {
  hasQuery: boolean;
  hasCategory: boolean;
  title?: string;
  description?: string;
}) {
  const showClear = hasQuery || hasCategory;
  return (
    <div className="border border-dashed border-border p-10 text-center">
      <p className="text-sm font-medium">
        {title ??
          (showClear
            ? "No products match those filters."
            : "No products yet.")}
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {description ??
          (showClear
            ? "Try a different search term or category."
            : "Once the catalog has active Products, they will appear here.")}
      </p>
      {showClear && (
        <Link
          href="/products"
          className="mt-4 inline-flex h-9 items-center border border-input bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          Clear filters
        </Link>
      )}
    </div>
  );
}

function SetupHint() {
  return (
    <div className="site-container py-10">
      <div className="rounded-xl border border-dashed border-border p-10 text-center">
        <p className="text-sm font-medium">The catalog is waiting for Supabase.</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Copy `.env.example` to `.env.local`, add your Supabase project keys, and
          apply the migrations in `supabase/migrations/` to load the seed catalog.
        </p>
      </div>
    </div>
  );
}
