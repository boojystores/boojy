import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createProduct,
  deleteProduct,
  updateProduct,
  validateImageFile,
  type ProductInput,
  type ProductMutationResult,
} from "./products";
import {
  uploadBufferToCloudinary,
  deleteFromCloudinary,
} from "@/lib/cloudinary";

/**
 * Product image lifecycle (ADR-0008) backed by Cloudinary.
 *
 * This module is server-only (it imports `sharp` and Cloudinary SDK), so it is
 * never bundled into client components. The database operations (`products.ts`)
 * remain client-safe.
 *
 * Every upload is re-encoded server-side to WebP (longest edge ≤ 1600px,
 * quality 80, auto-oriented) before upload to Cloudinary, ensuring small
 * payload sizes and fast global delivery.
 *
 * Lifecycle guarantees:
 * - Creates: image uploads first, product is created pointing at its URL.
 *   If product insert fails, the newly uploaded image is deleted (no orphan).
 * - Updates: if a new image is provided, it is uploaded, product is updated,
 *   and previous Cloudinary image is deleted best-effort.
 * - Deletes: product is deleted from database, then its image is deleted from
 *   Cloudinary best-effort.
 * - Seed / external URLs (e.g. picsum.photos) are never touched by delete.
 */

export const PRODUCT_IMAGE_FOLDER = "boojy/products";
/** Alias for backward compatibility */
export const PRODUCT_IMAGE_BUCKET = PRODUCT_IMAGE_FOLDER;
export const IMAGE_MAX_DIMENSION = 1600;
export const IMAGE_WEBP_QUALITY = 80;
export const IMAGE_OUTPUT_TYPE = "image/webp";

/**
 * Re-encodes a picked image to WebP, capped at `IMAGE_MAX_DIMENSION` on the
 * longest edge (never upscales), with EXIF orientation applied. Pure pipeline
 * — returns the processed bytes, no I/O beyond `sharp`.
 */
export async function compressImage(file: File): Promise<Buffer> {
  const input = Buffer.from(await file.arrayBuffer());
  return sharp(input)
    .rotate()
    .resize(IMAGE_MAX_DIMENSION, IMAGE_MAX_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: IMAGE_WEBP_QUALITY })
    .toBuffer();
}

/**
 * Extracts the Cloudinary public_id from a URL, or `null` when the URL
 * does not point to Cloudinary (seed images, foreign domains, malformed URLs).
 * Callers use this to decide whether removal is applicable.
 */
export function cloudinaryPublicIdFromUrl(
  imageUrl: string | null | undefined,
): string | null {
  if (!imageUrl) return null;
  try {
    const parsed = new URL(imageUrl);
    if (!parsed.hostname.includes("cloudinary.com")) return null;
    const pathname = parsed.pathname;
    const uploadIndex = pathname.indexOf("/upload/");
    if (uploadIndex === -1) return null;

    const afterUpload = pathname.slice(uploadIndex + "/upload/".length);
    // Strip optional transformation and version tag, e.g. "v1700000000/..."
    const versionMatch = afterUpload.match(/(?:^|\/)v\d+\/(.+)$/);
    const pathWithExt = versionMatch ? versionMatch[1] : afterUpload;

    // Remove file extension (.webp, .jpg, etc.)
    const dotIndex = pathWithExt.lastIndexOf(".");
    const publicId = dotIndex !== -1 ? pathWithExt.slice(0, dotIndex) : pathWithExt;
    return publicId.length > 0 ? decodeURIComponent(publicId) : null;
  } catch {
    return null;
  }
}

/** Alias retained for backwards compatibility with tests and callers */
export const imagePathFromUrl = cloudinaryPublicIdFromUrl;

/**
 * Validates, compresses, and uploads an image to Cloudinary,
 * returning its secure public URL.
 */
export async function uploadProductImage(
  _client: SupabaseClient,
  file: File,
): Promise<{ url: string } | { error: string }> {
  const invalid = validateImageFile(file);
  if (invalid) return { error: invalid };

  let processed: Buffer;
  try {
    processed = await compressImage(file);
  } catch {
    return { error: "The image could not be processed." };
  }

  try {
    const { url } = await uploadBufferToCloudinary(processed, {
      folder: PRODUCT_IMAGE_FOLDER,
    });
    return { url };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return { error: `Upload failed: ${message}` };
  }
}

/**
 * Best-effort removal of a product's Cloudinary image. Never throws and never
 * touches URLs outside Cloudinary (e.g. seed images) — a failed removal must
 * not block the admin's database action.
 */
export async function removeProductImage(
  _client: SupabaseClient,
  imageUrl: string | null | undefined,
): Promise<void> {
  const publicId = cloudinaryPublicIdFromUrl(imageUrl);
  if (!publicId) return;
  try {
    await deleteFromCloudinary(publicId);
  } catch {
    // Best-effort by contract: swallow network/service outages.
  }
}

/**
 * Uploads the image to Cloudinary first, then creates the Product.
 * If the insert fails, the freshly uploaded image is deleted best-effort
 * so a failed create leaves no orphan.
 */
export async function createProductWithImage(
  client: SupabaseClient,
  input: ProductInput,
  file: File,
): Promise<ProductMutationResult> {
  const upload = await uploadProductImage(client, file);
  if ("error" in upload) {
    return { ok: false, message: upload.error };
  }

  const result = await createProduct(client, { ...input, image_url: upload.url });
  if (!result.ok) {
    await removeProductImage(client, upload.url);
  }
  return result;
}

/**
 * Updates a Product, replacing its image when a new file is provided (keeps
 * the current one otherwise) and then best-effort removes the old Cloudinary
 * object so replacements never orphan images.
 */
export async function updateProductWithImage(
  client: SupabaseClient,
  id: string,
  input: ProductInput,
  file: File | null,
): Promise<ProductMutationResult> {
  const { data: current } = await client
    .from("products")
    .select("image_url")
    .eq("id", id)
    .maybeSingle();
  const previousImageUrl = (current as { image_url?: string } | null)?.image_url ?? "";

  let imageUrl = previousImageUrl;
  if (file && file.size > 0) {
    const upload = await uploadProductImage(client, file);
    if ("error" in upload) {
      return { ok: false, message: upload.error };
    }
    imageUrl = upload.url;
  }

  const result = await updateProduct(client, id, { ...input, image_url: imageUrl });
  if (result.ok && previousImageUrl && previousImageUrl !== imageUrl) {
    await removeProductImage(client, previousImageUrl);
  }
  return result;
}

/** Deletes the Product, then best-effort removes its Cloudinary image. */
export async function deleteProductWithImage(
  client: SupabaseClient,
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const result = await deleteProduct(client, id);
  if (result.ok && result.image_url) {
    await removeProductImage(client, result.image_url);
  }
  return result.ok ? { ok: true } : result;
}
