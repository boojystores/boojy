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
import {
  encodeProductMetadata,
  extractProductImages,
} from "@/features/catalog/lib/catalog";

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
 * Validates, compresses, and uploads multiple images to Cloudinary,
 * returning their secure public URLs.
 */
export async function uploadMultipleProductImages(
  _client: SupabaseClient,
  files: File[],
): Promise<{ urls: string[] } | { error: string }> {
  for (const file of files) {
    const invalid = validateImageFile(file);
    if (invalid) return { error: invalid };
  }

  const uploadedUrls: string[] = [];
  try {
    for (const file of files) {
      const processed = await compressImage(file);
      const { url } = await uploadBufferToCloudinary(processed, {
        folder: PRODUCT_IMAGE_FOLDER,
      });
      uploadedUrls.push(url);
    }
    return { urls: uploadedUrls };
  } catch (error: unknown) {
    // If one upload fails, clean up any images uploaded during this batch
    for (const url of uploadedUrls) {
      await removeProductImage(_client, url);
    }
    const message = error instanceof Error ? error.message : "Upload failed";
    return { error: `Upload failed: ${message}` };
  }
}

/**
 * Uploads one or multiple images to Cloudinary first, then creates the Product.
 * If the insert fails, all freshly uploaded images are deleted best-effort
 * so a failed create leaves no orphans.
 */
export async function createProductWithImage(
  client: SupabaseClient,
  input: ProductInput,
  files: File | File[],
): Promise<ProductMutationResult> {
  const fileList = Array.isArray(files) ? files : [files];
  if (fileList.length === 0) {
    return { ok: false, message: "At least one image is required." };
  }

  const upload = await uploadMultipleProductImages(client, fileList);
  if ("error" in upload) {
    return { ok: false, message: upload.error };
  }

  const allImages = upload.urls;
  const primaryUrl = allImages[0];
  const encodedDescription = encodeProductMetadata(input.description, {
    categoryIds: input.category_ids,
    images: allImages,
    sizes: input.sizes,
  });

  const result = await createProduct(client, {
    ...input,
    description: encodedDescription,
    image_url: primaryUrl,
    images: allImages,
  });

  if (!result.ok) {
    for (const url of allImages) {
      await removeProductImage(client, url);
    }
  }
  return result;
}

/**
 * Updates a Product, uploading any newly selected files to Cloudinary,
 * preserving retained images, setting the primary image, and best-effort
 * removing any replaced/deleted Cloudinary objects.
 */
export async function updateProductWithImage(
  client: SupabaseClient,
  id: string,
  input: ProductInput,
  filesOrNewFiles: File | File[] | null,
  retainedImages?: string[],
  imageOrder?: string[],
): Promise<ProductMutationResult> {
  const { data: current } = await client
    .from("products")
    .select("image_url, description")
    .eq("id", id)
    .maybeSingle();

  const previousImages = current ? extractProductImages(current as { image_url: string; description: string | null }) : [];
  const previousImageUrl = (current as { image_url?: string } | null)?.image_url ?? "";

  const newFiles = Array.isArray(filesOrNewFiles)
    ? filesOrNewFiles
    : filesOrNewFiles && filesOrNewFiles.size > 0
      ? [filesOrNewFiles]
      : [];

  let newUploadedUrls: string[] = [];
  if (newFiles.length > 0) {
    const upload = await uploadMultipleProductImages(client, newFiles);
    if ("error" in upload) {
      return { ok: false, message: upload.error };
    }
    newUploadedUrls = upload.urls;
  }

  // Determine final image list
  let finalImages: string[];
  if (imageOrder && imageOrder.length > 0) {
    let nextNewIndex = 0;
    finalImages = imageOrder
      .map((token) => {
        if (token.startsWith("existing:")) {
          return token.slice("existing:".length);
        }
        if (token.startsWith("new:")) {
          const indexStr = token.slice("new:".length);
          const parsedIndex = parseInt(indexStr, 10);
          const idx = isNaN(parsedIndex) ? nextNewIndex++ : parsedIndex;
          return newUploadedUrls[idx];
        }
        return token;
      })
      .filter((url): url is string => typeof url === "string" && url.length > 0);
  } else if (retainedImages !== undefined) {
    finalImages = [...retainedImages, ...newUploadedUrls];
  } else if (newUploadedUrls.length > 0) {
    // Single replacement without explicit retained list
    finalImages = [...newUploadedUrls];
  } else {
    // No new files and no explicit retained list -> keep previous
    finalImages = previousImages.length > 0
      ? previousImages
      : previousImageUrl
        ? [previousImageUrl]
        : [];
  }

  if (finalImages.length === 0) {
    for (const url of newUploadedUrls) {
      await removeProductImage(client, url);
    }
    return {
      ok: false,
      message: "A product must always have at least one image — keep the existing one or choose a new one.",
    };
  }

  const primaryUrl = finalImages[0];
  const encodedDescription = encodeProductMetadata(input.description, {
    categoryIds: input.category_ids,
    images: finalImages,
    sizes: input.sizes,
  });

  const result = await updateProduct(client, id, {
    ...input,
    description: encodedDescription,
    image_url: primaryUrl,
    images: finalImages,
  });

  if (result.ok) {
    // Best-effort removal of removed Cloudinary images
    for (const oldUrl of previousImages) {
      if (!finalImages.includes(oldUrl)) {
        await removeProductImage(client, oldUrl);
      }
    }
  } else {
    // Clean up newly uploaded images on database failure
    for (const url of newUploadedUrls) {
      await removeProductImage(client, url);
    }
  }

  return result;
}

/** Deletes the Product, then best-effort removes its Cloudinary images. */
export async function deleteProductWithImage(
  client: SupabaseClient,
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: current } = await client
    .from("products")
    .select("image_url, description")
    .eq("id", id)
    .maybeSingle();

  const imagesToDelete = current
    ? extractProductImages(current as { image_url: string; description: string | null })
    : [];

  const result = await deleteProduct(client, id);
  if (result.ok) {
    for (const url of imagesToDelete) {
      await removeProductImage(client, url);
    }
  }
  return result.ok ? { ok: true } : result;
}
