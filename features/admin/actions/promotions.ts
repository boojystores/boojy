"use server";

import fs from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import {
  DEFAULT_PROMO_CONFIG,
  type PromoCardConfig,
} from "@/features/catalog/lib/promo-card";

const PROMO_FILE_PATH = path.join(process.cwd(), "public", "promo-card.json");

export async function getPromoConfig(): Promise<PromoCardConfig> {
  try {
    const raw = await fs.readFile(PROMO_FILE_PATH, "utf-8");
    return JSON.parse(raw) as PromoCardConfig;
  } catch {
    return DEFAULT_PROMO_CONFIG;
  }
}

export async function savePromoConfig(
  config: PromoCardConfig,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await fs.writeFile(PROMO_FILE_PATH, JSON.stringify(config, null, 2), "utf-8");
    revalidatePath("/");
    revalidatePath("/products");
    revalidatePath("/admin");
    revalidatePath("/admin/promotions");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to save promo config.",
    };
  }
}
