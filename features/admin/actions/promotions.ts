"use server";

import fs from "fs/promises";
import path from "path";
import os from "os";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import {
  DEFAULT_PROMO_CONFIG,
  type PromoCardConfig,
} from "@/features/catalog/lib/promo-card";
import { compressImage } from "@/features/admin/lib/products/images";
import { validateImageFile } from "@/features/admin/lib/products/products";
import { uploadBufferToCloudinary } from "@/lib/cloudinary";

const PROMO_FILE_PATH = path.join(process.cwd(), "public", "promo-card.json");
const TMP_PROMO_FILE_PATH = path.join(os.tmpdir(), "promo-card.json");

// In-memory cache for fast serverless execution
let memoryPromoCache: PromoCardConfig | null = null;

export async function getPromoConfig(): Promise<PromoCardConfig> {
  // 1. Try Supabase database (production persistent store)
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("store_settings")
      .select("value")
      .eq("key", "promo_card_config")
      .maybeSingle();

    if (!error && data?.value) {
      memoryPromoCache = data.value as PromoCardConfig;
      return memoryPromoCache;
    }
  } catch {
    // Ignore and fall through to file/cache
  }

  // 2. Try in-memory cache
  if (memoryPromoCache) {
    return memoryPromoCache;
  }

  // 3. Try /tmp directory (writable in serverless)
  try {
    const raw = await fs.readFile(TMP_PROMO_FILE_PATH, "utf-8");
    memoryPromoCache = JSON.parse(raw) as PromoCardConfig;
    return memoryPromoCache;
  } catch {
    // Ignore and fall through
  }

  // 4. Try public/promo-card.json (bundled with build)
  try {
    const raw = await fs.readFile(PROMO_FILE_PATH, "utf-8");
    memoryPromoCache = JSON.parse(raw) as PromoCardConfig;
    return memoryPromoCache;
  } catch {
    return DEFAULT_PROMO_CONFIG;
  }
}

export async function savePromoConfig(
  config: PromoCardConfig,
): Promise<{ ok: boolean; error?: string }> {
  let dbSaved = false;
  let tmpSaved = false;

  // Update in-memory cache immediately
  memoryPromoCache = config;

  // 1. Save to Supabase store_settings (primary persistent store across serverless instances)
  try {
    const supabase = createServiceClient();
    const { error: dbError } = await supabase
      .from("store_settings")
      .upsert(
        {
          key: "promo_card_config",
          value: config,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );

    if (!dbError) {
      dbSaved = true;
    } else {
      console.warn("[Promotions] Supabase store_settings upsert warning:", dbError.message);
    }
  } catch (err) {
    console.warn("[Promotions] Supabase connection error:", err);
  }

  // 2. Save to /tmp (always writable on serverless / Vercel lambda)
  try {
    await fs.writeFile(TMP_PROMO_FILE_PATH, JSON.stringify(config, null, 2), "utf-8");
    tmpSaved = true;
  } catch (tmpErr) {
    console.warn("[Promotions] Failed to write to /tmp:", tmpErr);
  }

  // 3. Attempt local public/ file write (works on local dev; safely ignore EROFS in serverless production)
  try {
    await fs.writeFile(PROMO_FILE_PATH, JSON.stringify(config, null, 2), "utf-8");
  } catch {
    // In serverless environments (e.g. AWS Lambda / Vercel), /var/task is read-only (EROFS).
    // As long as Supabase or /tmp has the data, this is safely ignored.
    console.log("[Promotions] Read-only serverless filesystem detected. Saved to persistent storage.");
  }

  // If at least DB or /tmp was updated, consider the operation successful
  if (dbSaved || tmpSaved) {
    revalidatePath("/");
    revalidatePath("/products");
    revalidatePath("/admin");
    revalidatePath("/admin/promotions");
    return { ok: true };
  }

  return {
    ok: false,
    error: "Failed to persist promotions config. Please check your Supabase connection.",
  };
}

export async function uploadPromoBannerAction(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { ok: false, error: "Please select an image file." };
  }

  const invalid = validateImageFile(file);
  if (invalid) {
    return { ok: false, error: invalid };
  }

  try {
    const compressed = await compressImage(file);
    const { url } = await uploadBufferToCloudinary(compressed, {
      folder: "boojy/promotions",
    });
    return { ok: true, url };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to upload banner to Cloudinary.",
    };
  }
}
