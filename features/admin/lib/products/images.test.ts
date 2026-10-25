import { beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMockSupabase, type MockSupabase } from "@/lib/testing/mock-supabase";
import {
  compressImage,
  createProductWithImage,
  deleteProductWithImage,
  cloudinaryPublicIdFromUrl,
  imagePathFromUrl,
  IMAGE_MAX_DIMENSION,
  PRODUCT_IMAGE_FOLDER,
  removeProductImage,
  updateProductWithImage,
  uploadProductImage,
} from "./images";
import type { ProductInput } from "./products";
import {
  mockCloudinaryStorage,
  setMockCloudinaryFailures,
} from "@/lib/cloudinary";

const toClient = (mock: MockSupabase) => mock as unknown as SupabaseClient;

const CLOUDINARY_URL = (publicId: string) =>
  `https://res.cloudinary.com/boojy-store/image/upload/v1/${publicId}.webp`;

const input: ProductInput = {
  name: "Gan 356 M",
  description: "Magnetic",
  price: 39.99,
  stock_quantity: 12,
  status: "active",
  category_id: "c1",
  image_url: "",
};

/** Builds a real PNG File in memory so `sharp` has something to re-encode. */
async function makePng(width = 200, height = 100): Promise<File> {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .png()
    .toBuffer();
  // Copy into a plain Uint8Array — Buffer is not assignable to BlobPart.
  return new File([new Uint8Array(buffer)], "test.png", { type: "image/png" });
}

beforeEach(() => {
  mockCloudinaryStorage.clear();
  setMockCloudinaryFailures({ upload: false, remove: false });
});

describe("compressImage (ADR-0008)", () => {
  it("re-encodes to WebP within the max dimension", async () => {
    const file = await makePng(3200, 1600);
    const output = await compressImage(file);

    const meta = await sharp(output).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(
      IMAGE_MAX_DIMENSION,
    );
    expect(meta.width).toBe(1600); // 3200x1600 -> capped on the longest edge
    expect(meta.height).toBe(800);
  });

  it("never upscales small images", async () => {
    const file = await makePng(64, 64);
    const output = await compressImage(file);

    const meta = await sharp(output).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(64);
    expect(meta.height).toBe(64);
  });
});

describe("cloudinaryPublicIdFromUrl", () => {
  it("extracts a public_id from a Cloudinary URL", () => {
    expect(cloudinaryPublicIdFromUrl(CLOUDINARY_URL("boojy/products/abc"))).toBe(
      "boojy/products/abc",
    );
    expect(imagePathFromUrl(CLOUDINARY_URL("boojy/products/abc"))).toBe(
      "boojy/products/abc",
    );
  });

  it("returns null for anything outside Cloudinary", () => {
    expect(cloudinaryPublicIdFromUrl("https://picsum.photos/seed/cube-3x3/800/800")).toBeNull();
    expect(
      cloudinaryPublicIdFromUrl(
        "https://mock.supabase.co/storage/v1/object/public/other-bucket/products/abc.webp",
      ),
    ).toBeNull();
    expect(cloudinaryPublicIdFromUrl("not a url")).toBeNull();
    expect(cloudinaryPublicIdFromUrl(null)).toBeNull();
    expect(cloudinaryPublicIdFromUrl("")).toBeNull();
  });
});

describe("uploadProductImage (Cloudinary)", () => {
  it("uploads a compressed WebP and returns its public URL", async () => {
    const supabase = createMockSupabase();
    const result = await uploadProductImage(toClient(supabase), await makePng());

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.url).toMatch(
      new RegExp(`https://res\\.cloudinary\\.com/.+/${PRODUCT_IMAGE_FOLDER}/[a-f0-9-]+\\.webp$`),
    );
    expect(mockCloudinaryStorage.size).toBe(1);
  });

  it("rejects files that fail client-side validation", async () => {
    const supabase = createMockSupabase();
    const gif = new File([new Uint8Array([1, 2, 3])], "x.gif", { type: "image/gif" });
    const result = await uploadProductImage(toClient(supabase), gif);

    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toMatch(/JPG, PNG, or WebP/i);
    expect(mockCloudinaryStorage.size).toBe(0);
  });

  it("surfaces a storage upload failure", async () => {
    const supabase = createMockSupabase();
    setMockCloudinaryFailures({ upload: true });

    const result = await uploadProductImage(toClient(supabase), await makePng());
    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error).toMatch(/Upload failed/i);
  });
});

describe("removeProductImage (Cloudinary)", () => {
  it("removes an object that lives in Cloudinary", async () => {
    const supabase = createMockSupabase();
    mockCloudinaryStorage.set("boojy/products/abc", Buffer.from([1]));

    await removeProductImage(toClient(supabase), CLOUDINARY_URL("boojy/products/abc"));
    expect(mockCloudinaryStorage.size).toBe(0);
  });

  it("never touches URLs outside Cloudinary (seed images, foreign buckets)", async () => {
    const supabase = createMockSupabase();
    mockCloudinaryStorage.set("boojy/products/abc", Buffer.from([1]));

    await removeProductImage(toClient(supabase), "https://picsum.photos/seed/cube-3x3/800/800");
    expect(mockCloudinaryStorage.size).toBe(1);
  });

  it("is best-effort when storage removal fails — never throws", async () => {
    const supabase = createMockSupabase();
    setMockCloudinaryFailures({ remove: true });

    await expect(
      removeProductImage(toClient(supabase), CLOUDINARY_URL("boojy/products/abc")),
    ).resolves.toBeUndefined();
  });
});

describe("createProductWithImage", () => {
  it("uploads the image and creates the product pointing at its URL", async () => {
    const supabase = createMockSupabase({ products: [], categories: [] });
    const result = await createProductWithImage(
      toClient(supabase),
      input,
      await makePng(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.product.image_url).toContain(`/${PRODUCT_IMAGE_FOLDER}/`);
    expect(supabase.db.products).toHaveLength(1);
    expect(mockCloudinaryStorage.size).toBe(1);
  });

  it("fails without creating a product when the image upload fails", async () => {
    const supabase = createMockSupabase({ products: [], categories: [] });
    setMockCloudinaryFailures({ upload: true });

    const result = await createProductWithImage(toClient(supabase), input, await makePng());
    expect(result.ok).toBe(false);
    expect(supabase.db.products).toHaveLength(0);
  });

  it("removes the uploaded object when the DB insert fails (no orphan)", async () => {
    const supabase = createMockSupabase({ products: [], categories: [] });
    supabase.failNext({ op: "insert", table: "products" });

    const result = await createProductWithImage(toClient(supabase), input, await makePng());
    expect(result.ok).toBe(false);
    expect(supabase.db.products).toHaveLength(0);
    expect(mockCloudinaryStorage.size).toBe(0);
  });
});

describe("updateProductWithImage (Cloudinary)", () => {
  const row = {
    id: "p1",
    name: "3x3 Speed Cube",
    description: "Classic",
    price: 12.99,
    stock_quantity: 50,
    image_url: CLOUDINARY_URL("boojy/products/old"),
    status: "active",
    category_id: "c1",
    created_at: "2026-01-01T00:00:00Z",
  };

  it("replaces the image and best-effort removes the old object", async () => {
    const supabase = createMockSupabase({ products: [row] });
    mockCloudinaryStorage.set("boojy/products/old", Buffer.from([1]));

    const result = await updateProductWithImage(
      toClient(supabase),
      "p1",
      input,
      await makePng(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.product.image_url).toMatch(/\.webp$/);
    expect(result.product.image_url).not.toBe(row.image_url);
    // Old object removed; exactly the new one remains.
    expect(mockCloudinaryStorage.size).toBe(1);
    expect(mockCloudinaryStorage.has("boojy/products/old")).toBe(false);
  });

  it("keeps the existing image when no new file is provided", async () => {
    const supabase = createMockSupabase({ products: [row] });
    mockCloudinaryStorage.set("boojy/products/old", Buffer.from([1]));

    const result = await updateProductWithImage(toClient(supabase), "p1", input, null);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.product.image_url).toBe(row.image_url);
    expect(mockCloudinaryStorage.size).toBe(1); // untouched
  });

  it("rejects an update that would blank the image (DB has none, no new file)", async () => {
    const supabase = createMockSupabase({ products: [{ ...row, image_url: "" }] });

    const result = await updateProductWithImage(toClient(supabase), "p1", input, null);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/image/i);
  });

  it("still saves when removal of the old image fails (best-effort)", async () => {
    const supabase = createMockSupabase({ products: [row] });
    setMockCloudinaryFailures({ remove: true });

    const result = await updateProductWithImage(
      toClient(supabase),
      "p1",
      input,
      await makePng(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.product.image_url).not.toBe(row.image_url);
  });

  it("supports uploading multiple pictures and preserving retained images", async () => {
    const supabase = createMockSupabase({ products: [row] });
    mockCloudinaryStorage.set("boojy/products/old", Buffer.from([1]));

    const file1 = await makePng();
    const file2 = await makePng();

    const result = await updateProductWithImage(
      toClient(supabase),
      "p1",
      input,
      [file1, file2],
      ["https://picsum.photos/keep-this.jpg"],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Cover photo is the first in the retained list
    expect(result.product.image_url).toBe("https://picsum.photos/keep-this.jpg");
    // All 3 images are present in the product's image collection
    expect(result.product.images).toHaveLength(3);
    // 2 new images uploaded to Cloudinary
    expect(mockCloudinaryStorage.size).toBe(2);
    // Old un-retained Cloudinary image removed
    expect(mockCloudinaryStorage.has("boojy/products/old")).toBe(false);
  });

  it("strictly respects custom imageOrder sequence (allowing new files to be 1st/cover or interleaved)", async () => {
    const supabase = createMockSupabase({ products: [row] });
    const newFile = await makePng();

    // Custom order: newly uploaded file is 1st (Cover), then existing keep-2, then existing keep-1
    const result = await updateProductWithImage(
      toClient(supabase),
      "p1",
      input,
      [newFile],
      ["https://picsum.photos/keep-1.jpg", "https://picsum.photos/keep-2.jpg"],
      ["new:0", "existing:https://picsum.photos/keep-2.jpg", "existing:https://picsum.photos/keep-1.jpg"],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The newly uploaded file became the #1 Cover photo
    expect(result.product.image_url).toMatch(/cloudinary/);
    expect(result.product.images).toBeDefined();
    const productImages = result.product.images!;
    expect(productImages).toHaveLength(3);
    expect(productImages[0]).toBe(result.product.image_url);
    expect(productImages[1]).toBe("https://picsum.photos/keep-2.jpg");
    expect(productImages[2]).toBe("https://picsum.photos/keep-1.jpg");
  });
});

describe("deleteProductWithImage (Cloudinary)", () => {
  const row = {
    id: "p1",
    name: "3x3 Speed Cube",
    description: "Classic",
    price: 12.99,
    stock_quantity: 50,
    image_url: CLOUDINARY_URL("boojy/products/abc"),
    status: "active",
    category_id: "c1",
    created_at: "2026-01-01T00:00:00Z",
  };

  it("deletes the product and its image object", async () => {
    const supabase = createMockSupabase({ products: [row] });
    mockCloudinaryStorage.set("boojy/products/abc", Buffer.from([1]));

    const result = await deleteProductWithImage(toClient(supabase), "p1");

    expect(result).toEqual({ ok: true });
    expect(supabase.db.products).toEqual([]);
    expect(mockCloudinaryStorage.size).toBe(0);
  });

  it("does not touch external (seed) image URLs on delete", async () => {
    const supabase = createMockSupabase({
      products: [{ ...row, image_url: "https://picsum.photos/seed/cube-3x3/800/800" }],
    });
    mockCloudinaryStorage.set("boojy/products/abc", Buffer.from([1]));

    const result = await deleteProductWithImage(toClient(supabase), "p1");

    expect(result).toEqual({ ok: true });
    expect(supabase.db.products).toEqual([]);
    expect(mockCloudinaryStorage.size).toBe(1); // untouched
  });

  it("still deletes the product when image removal fails (best-effort)", async () => {
    const supabase = createMockSupabase({ products: [row] });
    setMockCloudinaryFailures({ remove: true });

    const result = await deleteProductWithImage(toClient(supabase), "p1");

    expect(result).toEqual({ ok: true });
    expect(supabase.db.products).toEqual([]);
  });
});
