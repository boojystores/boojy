"use server";

import { createClient } from "@/lib/supabase/server";
import {
  createProductWithImage,
  deleteProductWithImage,
  updateProductWithImage,
} from "@/features/admin/lib/products/images";
import {
  updateProductStatus,
  type ProductInput,
  type ProductMutationResult,
} from "@/features/admin/lib/products/products";
import {
  encodeDescriptionCategories,
  type ProductStatus,
} from "@/features/catalog/lib/catalog";

/**
 * Product write actions (ticket 09). The RLS admin policies on `products`
 * and the storage admin-write policy are the security boundary. Image
 * handling (validation, server-side compression to WebP, upload, and
 * best-effort cleanup of replaced/deleted images — ADR-0008) lives in
 * `features/admin/lib/products/images.ts`; these actions are thin glue.
 */

/**
 * Parses and validates the product form's text fields into a ProductInput.
 * Image rules live separately (`validateImageFile` / the create action's
 * presence check). Rules: name required; price a finite number >= 0; stock an
 * integer >= 0; status `active` or `inactive` (default `active`).
 */
function parseProductForm(
  formData: FormData,
): {
  input?: ProductInput;
  existingImages?: string[];
  imageOrder?: string[];
  error?: string;
} {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const priceRaw = String(formData.get("price") ?? "").trim();
  const stockRaw = String(formData.get("stock_quantity") ?? "").trim();
  const price = Number(priceRaw);
  const stock_quantity = Number(stockRaw);
  const status = String(formData.get("status") ?? "active");

  const rawCategoryIds = formData.getAll("category_ids").map(String);
  let category_ids: string[] = [];
  if (rawCategoryIds.length > 0) {
    category_ids = rawCategoryIds
      .flatMap((v) => v.split(","))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const singleCategoryRaw = String(formData.get("category_id") ?? "").trim();
  if (singleCategoryRaw && !category_ids.includes(singleCategoryRaw)) {
    category_ids.unshift(singleCategoryRaw);
  }
  const category_id = category_ids[0] ?? null;
  const encodedDescription = encodeDescriptionCategories(description, category_ids);

  const rawSizes = formData.getAll("sizes").map(String);
  let sizes: string[] = [];
  if (rawSizes.length > 0) {
    sizes = rawSizes
      .flatMap((v) => v.split(","))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const singleSizesRaw = String(formData.get("sizes") ?? "").trim();
  if (singleSizesRaw && sizes.length === 0) {
    try {
      const parsed = JSON.parse(singleSizesRaw);
      if (Array.isArray(parsed)) {
        sizes = parsed.map(String).map((s) => s.trim()).filter(Boolean);
      }
    } catch {
      sizes = singleSizesRaw.split(",").map((s) => s.trim()).filter(Boolean);
    }
  }

  const existingImages = formData
    .getAll("existing_images")
    .map(String)
    .map((s) => s.trim())
    .filter(Boolean);

  const rawImageOrder = formData.get("image_order");
  let imageOrder: string[] | undefined = undefined;
  if (typeof rawImageOrder === "string" && rawImageOrder.trim()) {
    try {
      const parsed = JSON.parse(rawImageOrder);
      if (Array.isArray(parsed)) {
        imageOrder = parsed.map(String);
      }
    } catch {
      // ignore parse error
    }
  }

  if (!name) return { error: "Product name is required." };
  // Reject blank fields explicitly — Number("") is 0, which would silently
  // create a $0 / zero-stock product if we only checked the parsed value.
  if (priceRaw === "" || !Number.isFinite(price) || price < 0) {
    return { error: "Enter a valid price." };
  }
  if (
    stockRaw === "" ||
    !Number.isInteger(stock_quantity) ||
    stock_quantity < 0
  ) {
    return { error: "Enter a valid stock quantity." };
  }
  if (status !== "active" && status !== "inactive") {
    return { error: "Invalid status." };
  }

  return {
    input: {
      name,
      description: encodedDescription,
      price,
      stock_quantity,
      status,
      category_id,
      category_ids,
      sizes,
      image_url: "",
    },
    existingImages,
    imageOrder,
  };
}

export async function createProductAction(
  formData: FormData,
): Promise<ProductMutationResult> {
  const supabase = await createClient();
  const { input, error } = parseProductForm(formData);
  if (error || !input) {
    return { ok: false, message: error ?? "Invalid form data." };
  }

  // Get all image files (supports multiple "new_images", "images", or single "image")
  const rawFiles = [
    ...formData.getAll("new_images"),
    ...formData.getAll("images"),
    formData.get("image"),
  ].filter((f): f is File => f instanceof File && f.size > 0);

  if (rawFiles.length === 0) {
    return { ok: false, message: "At least one image is required." };
  }

  return createProductWithImage(supabase, input, rawFiles);
}

export async function updateProductAction(
  formData: FormData,
): Promise<ProductMutationResult> {
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const { input, existingImages, imageOrder, error } = parseProductForm(formData);
  if (error || !input || !id) {
    return { ok: false, message: error ?? "Invalid form data." };
  }

  const rawFiles = [
    ...formData.getAll("new_images"),
    ...formData.getAll("images"),
    formData.get("image"),
  ].filter((f): f is File => f instanceof File && f.size > 0);

  const filesParam = rawFiles.length > 0 ? rawFiles : null;
  const retainedParam = formData.has("existing_images") ? existingImages : undefined;

  return updateProductWithImage(supabase, id, input, filesParam, retainedParam, imageOrder);
}

export async function deleteProductAction(
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = await createClient();
  return deleteProductWithImage(supabase, id);
}

export async function toggleProductStatusAction(
  id: string,
  status: ProductStatus,
): Promise<ProductMutationResult> {
  const supabase = await createClient();
  return updateProductStatus(supabase, id, status);
}
