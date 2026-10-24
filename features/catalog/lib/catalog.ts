import type { SupabaseClient } from "@supabase/supabase-js";

export type ProductStatus = "active" | "inactive";

export type Category = {
  id: string;
  name: string;
  slug: string;
};

export type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock_quantity: number;
  image_url: string;
  images?: string[];
  status: ProductStatus;
  category_id: string | null;
  category_ids?: string[];
};

export const PRODUCT_COLUMNS =
  "id, name, description, price, stock_quantity, image_url, status, category_id";

/**
 * Extract all image URLs for a product:
 * 1. Explicit `images` array if present and populated
 * 2. Embedded metadata tags in description: <!--images:[...]-->
 * 3. Primary `image_url`
 */
export function extractProductImages(product: {
  image_url?: string | null;
  images?: string[] | null;
  description?: string | null;
}): string[] {
  const list: string[] = [];
  if (product.images && Array.isArray(product.images) && product.images.length > 0) {
    for (const url of product.images) {
      if (typeof url === "string" && url.trim()) list.push(url.trim());
    }
  } else if (product.description) {
    const match = product.description.match(/<!--images:(\[.*?\])-->/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          for (const url of parsed) {
            if (typeof url === "string" && url.trim()) list.push(url.trim());
          }
        }
      } catch {}
    }
  }

  const primary = product.image_url?.trim();
  if (primary) {
    const filtered = list.filter((img) => img !== primary);
    return [primary, ...filtered];
  }
  return list;
}

/**
 * Extract all assigned category IDs for a product:
 * 1. Explicit `category_ids` array if present
 * 2. Embedded metadata tags in description: <!--categories:[...]-->
 * 3. Primary `category_id`
 */
export function extractProductCategories(product: {
  category_id?: string | null;
  category_ids?: string[] | null;
  description?: string | null;
}): string[] {
  if (product.category_ids && Array.isArray(product.category_ids) && product.category_ids.length > 0) {
    return product.category_ids;
  }
  if (product.description) {
    const match = product.description.match(/<!--categories:(\[.*?\])-->/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(String);
        }
      } catch {}
    }
  }
  return product.category_id ? [product.category_id] : [];
}

/**
 * Remove category and images metadata tags from description for clean display.
 */
export function cleanProductDescription(description: string | null | undefined): string {
  if (!description) return "";
  return description
    .replace(/\s*<!--categories:\[.*?\]-->/g, "")
    .replace(/\s*<!--images:\[.*?\]-->/g, "")
    .trim();
}

/**
 * Encode multiple categories and/or images into product description metadata.
 */
export function encodeProductMetadata(
  description: string | null | undefined,
  options: {
    categoryIds?: string[];
    images?: string[];
  } = {},
): string | null {
  const base = cleanProductDescription(description);
  const tags: string[] = [];

  if (options.categoryIds) {
    const unique = Array.from(new Set(options.categoryIds.filter(Boolean)));
    if (unique.length > 1) {
      tags.push(`<!--categories:${JSON.stringify(unique)}-->`);
    }
  }

  if (options.images) {
    const uniqueImgs = Array.from(new Set(options.images.map((s) => s.trim()).filter(Boolean)));
    if (uniqueImgs.length > 1) {
      tags.push(`<!--images:${JSON.stringify(uniqueImgs)}-->`);
    }
  }

  if (tags.length === 0) {
    return base || null;
  }
  return base ? `${base}\n\n${tags.join("\n")}` : tags.join("\n");
}

/**
 * Encode multiple categories into product description metadata.
 */
export function encodeDescriptionCategories(
  description: string | null | undefined,
  categoryIds: string[],
): string | null {
  return encodeProductMetadata(description, { categoryIds });
}

export type CatalogSort =
  | "featured"
  | "relevant"
  | "best-selling"
  | "title-asc"
  | "title-desc"
  | "price-asc"
  | "price-desc"
  | "created-asc"
  | "created-desc"
  | "newest";

const VALID_SORTS = new Set<string>([
  "featured",
  "relevant",
  "best-selling",
  "title-asc",
  "title-desc",
  "price-asc",
  "price-desc",
  "created-asc",
  "created-desc",
  "newest",
]);

/** The raw URL query shape of the /products listing, as Next passes it. */
export type ProductsSearchParams = {
  q?: string;
  category?: string;
  sort?: string;
  page?: string;
  stock?: string;
  minPrice?: string;
  maxPrice?: string;
};

/** Type guard for URL-driven sort values — usable from server and client. */
export function isValidSort(
  value: string | null | undefined,
): value is CatalogSort {
  return typeof value === "string" && VALID_SORTS.has(value);
}

/**
 * Catalog queries for the storefront. These are the read side of the single
 * testing seam: they take a Supabase client, so tests pass the mocked client
 * from `lib/testing/mock-supabase`.
 */

export async function getFeaturedCategories(client: SupabaseClient): Promise<Category[]> {
  const { data, error } = await client.from("categories").select("id, name, slug").order("name");

  if (error) return [];
  return (data ?? []) as Category[];
}

/**
 * Featured Products = the most recently added active Products. There is no
 * `featured` flag in the schema; "latest active" is the derivation used until
 * curation is needed.
 */
export async function getFeaturedProducts(
  client: SupabaseClient,
  limit = 4,
): Promise<Product[]> {
  const { data, error } = await client
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .order("stock_quantity", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []) as Product[];
}

/**
 * Parse comma-separated or repeated category slugs from the URL query.
 * e.g. "accessories,speed-cubes" -> ["accessories", "speed-cubes"]
 */
export function parseCategorySlugs(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.flatMap((s) => s.split(",")).map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export type CatalogParams = {
  /** Free-text search against the product name. */
  q?: string;
  /** Filter to a single Category by id. */
  categoryId?: string | null | undefined;
  /** Filter to multiple Categories by id (multi-select). */
  categoryIds?: string[] | null | undefined;
  sort?: CatalogSort;
  /** 1-based page number. */
  page?: number;
  pageSize?: number;
  /** Filter by stock availability: 'in-stock' (>0) or 'out-of-stock' (0). */
  stock?: "in-stock" | "out-of-stock" | string;
  /** Minimum price (inclusive). */
  minPrice?: number;
  /** Maximum price (inclusive). */
  maxPrice?: number;
};

export type CatalogResult = {
  products: Product[];
  /** Total rows matching the filters, before pagination (PostgREST `count`). */
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * The storefront catalog grid (ticket 03): active products only, with name
 * search, multi-category filter, price sorting, availability, and pagination — all
 * composed in one query so the URL state maps 1:1 to the result. Availability
 * is derived from `stock_quantity`; status is never used to hide stock.
 */
export async function searchCatalog(
  client: SupabaseClient,
  params: CatalogParams = {},
): Promise<CatalogResult> {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.max(1, Math.floor(params.pageSize ?? 12));
  const sort: CatalogSort = isValidSort(params.sort) ? params.sort : "featured";
  const q = params.q?.trim();

  let query = client
    .from("products")
    .select(PRODUCT_COLUMNS, {
      count: "exact",
    })
    .eq("status", "active");

  if (q) {
    query = query.ilike("name", `%${q}%`);
  }
  const filterCatIds =
    params.categoryIds && params.categoryIds.length > 0
      ? params.categoryIds
      : params.categoryId
        ? [params.categoryId]
        : [];

  if (filterCatIds.length > 0) {
    const clauses: string[] = [];
    for (const catId of filterCatIds) {
      clauses.push(`category_id.eq.${catId}`);
      clauses.push(`description.ilike.*${catId}*`);
    }
    query = query.or(clauses.join(","));
  }
  if (params.stock === "in-stock") {
    query = query.gt("stock_quantity", 0);
  } else if (params.stock === "out-of-stock") {
    query = query.eq("stock_quantity", 0);
  }
  if (params.minPrice != null && !Number.isNaN(Number(params.minPrice))) {
    query = query.gte("price", Number(params.minPrice));
  }
  if (params.maxPrice != null && !Number.isNaN(Number(params.maxPrice))) {
    query = query.lte("price", Number(params.maxPrice));
  }

  if (sort === "price-asc") {
    query = query.order("price", { ascending: true }).order("stock_quantity", { ascending: false });
  } else if (sort === "price-desc") {
    query = query.order("price", { ascending: false }).order("stock_quantity", { ascending: false });
  } else if (sort === "title-asc") {
    query = query.order("name", { ascending: true });
  } else if (sort === "title-desc") {
    query = query.order("name", { ascending: false });
  } else if (sort === "created-asc") {
    query = query.order("created_at", { ascending: true });
  } else if (sort === "created-desc") {
    query = query.order("created_at", { ascending: false });
  } else if (sort === "best-selling") {
    query = query.order("stock_quantity", { ascending: false }).order("created_at", { ascending: false });
  } else {
    // "featured", "relevant", "newest"
    query = query.order("created_at", { ascending: false }).order("stock_quantity", { ascending: false });
  }

  const from = (page - 1) * pageSize;
  query = query.range(from, from + pageSize - 1);

  const { data, error, count } = await query;
  const rawProducts = error ? [] : ((data ?? []) as Product[]);
  const products = rawProducts.map((p) => ({
    ...p,
    description: p.description ? cleanProductDescription(p.description) : null,
    category_ids: extractProductCategories(p),
    images: extractProductImages(p),
  }));
  const total = count ?? products.length;

  return {
    products,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * A single Product for the detail page. Only active Products are shown to the
 * storefront (status is visibility, stock is availability — spec); inactive or
 * unknown ids return null so the page can render its not-found state.
 */
export async function getProductById(
  client: SupabaseClient,
  id: string,
): Promise<Product | null> {
  const { data, error } = await client
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("status", "active")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  const p = data as Product;
  return {
    ...p,
    description: p.description ? cleanProductDescription(p.description) : null,
    category_ids: extractProductCategories(p),
    images: extractProductImages(p),
  };
}

/**
 * Related Products: active Products in the same Category as the given one,
 * excluding the Product itself, newest first. Falls back to an empty list when
 * the Product has no Category or the query errors.
 */
export async function getRelatedProducts(
  client: SupabaseClient,
  categoryId: string | null,
  excludeId: string,
  limit = 4,
): Promise<Product[]> {
  if (!categoryId) return [];

  const { data, error } = await client
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("status", "active")
    .or(`category_id.eq.${categoryId},description.ilike.*"${categoryId}"*`)
    .neq("id", excludeId)
    .order("created_at", { ascending: false })
    .order("stock_quantity", { ascending: false })
    .limit(limit);

  if (error) return [];
  return ((data ?? []) as Product[]).map((p) => ({
    ...p,
    description: p.description ? cleanProductDescription(p.description) : null,
    category_ids: extractProductCategories(p),
    images: extractProductImages(p),
  }));
}
