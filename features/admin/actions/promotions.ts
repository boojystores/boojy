"use server";

import fs from "fs/promises";
import path from "path";
import os from "os";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { assertAdmin } from "@/lib/auth/assert-admin";
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

  // 2. Try public/promo-card.json (bundled with build / local development)
  try {
    const raw = await fs.readFile(PROMO_FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as PromoCardConfig;
    memoryPromoCache = parsed;
    return parsed;
  } catch {
    // Ignore and fall through
  }

  // 3. Try /tmp directory (writable in serverless)
  try {
    const raw = await fs.readFile(TMP_PROMO_FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as PromoCardConfig;
    memoryPromoCache = parsed;
    return parsed;
  } catch {
    // Ignore and fall through
  }

  // 4. Fallback to memory cache or defaults
  return memoryPromoCache ?? DEFAULT_PROMO_CONFIG;
}

export async function savePromoConfig(
  config: PromoCardConfig,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertAdmin();
  } catch (err: any) {
    return { ok: false, error: err?.message || "Unauthorized." };
  }

  let fileSaved = false;

  // Update in-memory cache immediately
  memoryPromoCache = config;

  // 1. Save to local public/ file (always works in dev and writable containers)
  try {
    await fs.writeFile(PROMO_FILE_PATH, JSON.stringify(config, null, 2), "utf-8");
    fileSaved = true;
  } catch {
    // In serverless environments (e.g. AWS Lambda / Vercel), /var/task is read-only (EROFS).
  }

  // 2. Save to /tmp (always writable on serverless / Vercel lambda)
  try {
    await fs.writeFile(TMP_PROMO_FILE_PATH, JSON.stringify(config, null, 2), "utf-8");
    fileSaved = true;
  } catch (tmpErr) {
    console.warn("[Promotions] Failed to write to /tmp:", tmpErr);
  }

  // 3. Save to Supabase store_settings (primary persistent store across serverless instances)
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
      fileSaved = true;
    }
  } catch (err) {
    console.warn("[Promotions] Supabase connection error:", err);
  }

  // Invalidate storefront and admin paths across both page and layout scopes
  revalidatePath("/", "layout");
  revalidatePath("/");
  revalidatePath("/products");
  revalidatePath("/admin");
  revalidatePath("/admin/promotions");

  if (fileSaved) {
    return { ok: true };
  }

  return {
    ok: false,
    error: "Failed to persist promotions config.",
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
