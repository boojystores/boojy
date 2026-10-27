import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleanProductDescription,
  extractProductCategories,
  extractProductImages,
  extractProductSizes,
  PRODUCT_COLUMNS,
  type Product,
  type ProductStatus,
  type ProductVariant,
} from "@/features/catalog/lib/catalog";

/**
 * Admin product management (ticket 09). Like the other admin seams, reads and
 * writes run with the signed-in Admin's session — the RLS admin policies on
 * `products` permit them. This module validates the file shape and does the
 * database work; the image lifecycle (compression, upload, Storage cleanup)
 * lives in `./images.ts` (ADR-0008) and this file stays client-safe.
 */

export type VariantInput = {
  id?: string;
  size: string;
  color?: string | null;
  sku?: string | null;
  stock_quantity: number;
  status?: "active" | "archived";
};

export type ProductInput = {
  name: string;
  description: string | null;
  price: number;
  stock_quantity: number;
  status: ProductStatus;
  category_id: string | null;
  category_ids?: string[];
  sizes?: string[];
  variants?: VariantInput[];
  image_url: string;
  images?: string[];
};

export type ProductMutationResult =
  | { ok: true; product: Product }
  | { ok: false; message: string };

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * Client- and server-side guard for the mandatory product image. Returns an
 * error message or null when the file is acceptable.
 */
export function validateImageFile(file: {
  size: number;
  type: string;
}): string | null {
  if (!file) return "An image is required.";
  if (file.size <= 0) return "The image file is empty.";
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "Image must be JPG, PNG, or WebP.";
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return "Image must be 5 MB or smaller.";
  }
  return null;
}

function friendlyError(
  error: { code?: string; message?: string } | null,
  fallback: string,
): string {
  if (error?.code === "PGRST116") {
    return "That product no longer exists. Refresh the list and try again.";
  }
  return error?.message ?? fallback;
}

/**
 * Every Product (active and inactive) with its Category names, filtered by
 * name search and/or Category, newest first. Used by the admin list.
 */
export async function getProductVariants(
  client: SupabaseClient,
  productId: string,
): Promise<ProductVariant[]> {
  try {
    const { data, error } = await client
      .from("product_variants")
      .select("id, product_id, size, color, sku, stock_quantity, status, created_at, updated_at")
      .eq("product_id", productId)
      .eq("status", "active")
      .order("created_at", { ascending: true });

    if (error || !data) return [];
    return data as ProductVariant[];
  } catch {
    return [];
  }
}

/**
 * Every Product (active and inactive) with its Category names, filtered by
 * name search and/or Category, newest first. Used by the admin list.
 */
export async function listAdminProducts(
  client: SupabaseClient,
  params: { q?: string; categoryId?: string } = {},
): Promise<(Product & { category_name: string | null; category_names?: string[]; variants?: ProductVariant[] })[]> {
  let query = client
    .from("products")
    .select(PRODUCT_COLUMNS)
    .order("created_at", { ascending: false });
  if (params.q?.trim()) {
    query = query.ilike("name", `%${params.q.trim()}%`);
  }
  if (params.categoryId) {
    query = query.or(`category_id.eq.${params.categoryId},description.ilike.*${params.categoryId}*`);
  }

  const [products, categories] = await Promise.all([
    query,
    client.from("categories").select("id, name"),
  ]);
  if (products.error || categories.error) return [];

  const names = new Map(
    ((categories.data ?? []) as { id: string; name: string }[]).map((c) => [
      c.id,
      c.name,
    ]),
  );

  const variantsByProduct = new Map<string, ProductVariant[]>();
  try {
    const { data: vData } = await client
      .from("product_variants")
      .select("id, product_id, size, color, sku, stock_quantity, status, created_at, updated_at")
      .eq("status", "active")
      .order("created_at", { ascending: true });
    if (vData && Array.isArray(vData)) {
      for (const v of vData as ProductVariant[]) {
        const list = variantsByProduct.get(v.product_id) || [];
        list.push(v);
        variantsByProduct.set(v.product_id, list);
      }
    }
  } catch {
    // If table not present
  }

  return ((products.data ?? []) as Product[]).map((product) => {
    const categoryIds = extractProductCategories(product);
    const categoryNames = categoryIds
      .map((id) => names.get(id))
      .filter((n): n is string => Boolean(n));

    const pVariants = variantsByProduct.get(product.id) || [];
    const sizes =
      pVariants.length > 0
        ? pVariants.map((v) => v.size)
        : extractProductSizes(product);
    const totalStock =
      pVariants.length > 0
        ? pVariants.reduce((sum, v) => sum + (Number(v.stock_quantity) || 0), 0)
        : product.stock_quantity;

    return {
      ...product,
      stock_quantity: totalStock,
      description: cleanProductDescription(product.description),
      category_id: product.category_id ?? (categoryIds[0] ?? null),
      category_ids: categoryIds,
      category_names: categoryNames,
      category_name:
        categoryNames.length > 0
          ? categoryNames.join(", ")
          : product.category_id
            ? (names.get(product.category_id) ?? null)
            : null,
      images: extractProductImages(product),
      sizes,
      variants: pVariants.length > 0 ? pVariants : undefined,
    };
  });
}

export async function createProduct(
  client: SupabaseClient,
  input: ProductInput,
): Promise<ProductMutationResult> {
  const payload = { ...input };
  const variants = input.variants;
  delete payload.category_ids;
  delete payload.images;
  delete payload.sizes;
  delete payload.variants;

  // Total stock is automatically the sum of all size variants if variants exist
  if (variants && variants.length > 0) {
    payload.stock_quantity = variants.reduce(
      (sum, v) => sum + Math.max(0, Math.floor(Number(v.stock_quantity) || 0)),
      0,
    );
  }

  const { data, error } = await client
    .from("products")
    .insert(payload)
    .select(PRODUCT_COLUMNS)
    .single();

  if (error || !data) {
    return { ok: false, message: friendlyError(error, "Could not create the product.") };
  }
  const p = data as Product;

  let createdVariants: ProductVariant[] = [];
  if (variants && variants.length > 0) {
    const variantRows = variants.map((v) => ({
      product_id: p.id,
      size: v.size.trim(),
      color: v.color?.trim() || null,
      sku: v.sku?.trim() || null,
      stock_quantity: Math.max(0, Math.floor(Number(v.stock_quantity) || 0)),
      status: v.status || "active",
    }));

    try {
      const { data: vData } = await client
        .from("product_variants")
        .insert(variantRows)
        .select("id, product_id, size, color, sku, stock_quantity, status, created_at, updated_at");
      if (vData && Array.isArray(vData)) {
        createdVariants = vData as ProductVariant[];
      }
    } catch {
      // Ignore if table not present in mock
    }
  }

  const sizes =
    createdVariants.length > 0
      ? createdVariants.map((v) => v.size)
      : (input.sizes ?? extractProductSizes(p));

  const totalStock =
    createdVariants.length > 0
      ? createdVariants.reduce((sum, v) => sum + v.stock_quantity, 0)
      : p.stock_quantity;

  return {
    ok: true,
    product: {
      ...p,
      stock_quantity: totalStock,
      description: cleanProductDescription(p.description),
      category_ids: extractProductCategories(p),
      images: extractProductImages(p),
      sizes,
      variants: createdVariants.length > 0 ? createdVariants : undefined,
    },
  };
}

export async function updateProduct(
  client: SupabaseClient,
  id: string,
  input: ProductInput,
): Promise<ProductMutationResult> {
  // A Product must always have an image (ADR-0008) — the column is NOT NULL,
  // but reject with a friendly message before the database does.
  if (!input.image_url.trim()) {
    return {
      ok: false,
      message: "A product must always have an image — keep the existing one or choose a new one.",
    };
  }

  const payload = { ...input };
  const variants = input.variants;
  delete payload.category_ids;
  delete payload.images;
  delete payload.sizes;
  delete payload.variants;

  if (variants && variants.length > 0) {
    payload.stock_quantity = variants.reduce(
      (sum, v) => sum + Math.max(0, Math.floor(Number(v.stock_quantity) || 0)),
      0,
    );
  }

  const { data, error } = await client
    .from("products")
    .update(payload)
    .eq("id", id)
    .select(PRODUCT_COLUMNS)
    .single();

  if (error || !data) {
    return { ok: false, message: friendlyError(error, "Could not save the product.") };
  }
  const p = data as Product;

  let currentVariants: ProductVariant[] = [];
  if (variants !== undefined) {
    try {
      const { data: existingDbVariants } = await client
        .from("product_variants")
        .select("id, product_id, size, color, sku, stock_quantity, status")
        .eq("product_id", id);

      const existingList = (existingDbVariants ?? []) as ProductVariant[];
      const activeSizesInForm = new Set(variants.map((v) => v.size.toLowerCase().trim()));

      // 1. Upsert variants from form
      for (const v of variants) {
        const cleanSize = v.size.trim();
        const existing = existingList.find(
          (ev) => ev.size.toLowerCase().trim() === cleanSize.toLowerCase(),
        );

        const qty = Math.max(0, Math.floor(Number(v.stock_quantity) || 0));

        if (existing) {
          await client
            .from("product_variants")
            .update({
              stock_quantity: qty,
              status: "active",
              color: v.color?.trim() || null,
              sku: v.sku?.trim() || null,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else {
          await client.from("product_variants").insert({
            product_id: id,
            size: cleanSize,
            color: v.color?.trim() || null,
            sku: v.sku?.trim() || null,
            stock_quantity: qty,
            status: "active",
          });
        }
      }

      // 2. Safe removal/archival of sizes no longer in form:
      // Preserves historical order details: if variant was ordered, archive rather than hard-delete
      const removedVariants = existingList.filter(
        (ev) => !activeSizesInForm.has(ev.size.toLowerCase().trim()),
      );

      for (const removed of removedVariants) {
        const { count } = await client
          .from("order_items")
          .select("id", { count: "exact", head: true })
          .eq("variant_id", removed.id);

        if (count && count > 0) {
          await client
            .from("product_variants")
            .update({ status: "archived", stock_quantity: 0 })
            .eq("id", removed.id);
        } else {
          await client.from("product_variants").delete().eq("id", removed.id);
        }
      }

      const { data: refreshed } = await client
        .from("product_variants")
        .select("id, product_id, size, color, sku, stock_quantity, status, created_at, updated_at")
        .eq("product_id", id)
        .eq("status", "active")
        .order("created_at", { ascending: true });

      if (refreshed) currentVariants = refreshed as ProductVariant[];
    } catch {
      // In case table not present in mock
    }
  }

  const sizes =
    currentVariants.length > 0
      ? currentVariants.map((v) => v.size)
      : (input.sizes ?? extractProductSizes(p));

  const totalStock =
    currentVariants.length > 0
      ? currentVariants.reduce((sum, v) => sum + v.stock_quantity, 0)
      : p.stock_quantity;

  return {
    ok: true,
    product: {
      ...p,
      stock_quantity: totalStock,
      description: cleanProductDescription(p.description),
      category_ids: extractProductCategories(p),
      images: extractProductImages(p),
      sizes,
      variants: currentVariants.length > 0 ? currentVariants : undefined,
    },
  };
}

/** Quick active/inactive toggle from the list. */
export async function updateProductStatus(
  client: SupabaseClient,
  id: string,
  status: ProductStatus,
): Promise<ProductMutationResult> {
  const { data, error } = await client
    .from("products")
    .update({ status })
    .eq("id", id)
    .select(PRODUCT_COLUMNS)
    .single();

  if (error || !data) {
    return { ok: false, message: friendlyError(error, "Could not update the product status.") };
  }
  return { ok: true, product: data as Product };
}

/**
 * Deletes a Product. Historical order items reference it via
 * `on delete set null`, so deleting leaves no orphaned rows — order history
 * keeps its price snapshots (ADR-0003). Returns the deleted row's `image_url`
 * so the caller can remove the Storage object (ADR-0008).
 *
 * Before deleting, checks if there are any active orders (pending, confirmed,
 * preparing, shipped) that reference this product. If so, deletion is blocked
 * to prevent stock restoration issues.
 */
export async function deleteProduct(
  client: SupabaseClient,
  id: string,
): Promise<{ ok: true; image_url: string | null } | { ok: false; message: string }> {
  // Step 1: Get order IDs that reference this product
  const { data: orderItems } = await client
    .from("order_items")
    .select("order_id")
    .eq("product_id", id)
    .limit(100);

  // Step 2: Check if any of those orders are active
  if (orderItems && orderItems.length > 0) {
    const orderIds = [...new Set(orderItems.map((oi) => oi.order_id))];
    const { count } = await client
      .from("orders")
      .select("id", { count: "exact", head: true })
      .in("id", orderIds)
      .in("status", ["pending", "confirmed", "preparing", "shipped"]);

    if (count && count > 0) {
      return {
        ok: false,
        message:
          "This product cannot be deleted because it has been ordered. Consider marking it as inactive instead.",
      };
    }
  }

  // Proceed with deletion
  const { data, error } = await client
    .from("products")
    .delete()
    .eq("id", id)
    .select("image_url")
    .single();
  if (error || !data) {
    return { ok: false, message: friendlyError(error, "Could not delete the product.") };
  }
  return { ok: true, image_url: (data as { image_url: string }).image_url ?? null };
}
