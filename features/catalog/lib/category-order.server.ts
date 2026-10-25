import fs from "fs/promises";
import path from "path";
import os from "os";
import { createServiceClient } from "@/lib/supabase/service";

const ORDER_FILE_PATH = path.join(process.cwd(), "public", "category-order.json");
const TMP_ORDER_FILE_PATH = path.join(os.tmpdir(), "category-order.json");

let memoryOrderCache: string[] | null = null;

export async function getCategoryOrder(): Promise<string[]> {
  // 1. Try Supabase store_settings (persistent across serverless instances)
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("store_settings")
      .select("value")
      .eq("key", "category_order")
      .maybeSingle();

    if (!error && Array.isArray(data?.value) && data.value.length > 0) {
      memoryOrderCache = data.value;
      return memoryOrderCache;
    }
  } catch {
    // Ignore and fall through
  }

  // 2. Try public/category-order.json
  try {
    const raw = await fs.readFile(ORDER_FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      memoryOrderCache = parsed;
      return parsed;
    }
  } catch {
    // Ignore and fall through
  }

  // 3. Try /tmp
  try {
    const raw = await fs.readFile(TMP_ORDER_FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      memoryOrderCache = parsed;
      return parsed;
    }
  } catch {
    // Ignore
  }

  return memoryOrderCache ?? [];
}

export async function saveCategoryOrder(orderedIds: string[]): Promise<{ ok: boolean }> {
  memoryOrderCache = orderedIds;

  // 1. Write to Supabase store_settings
  try {
    const supabase = createServiceClient();
    await supabase.from("store_settings").upsert(
      {
        key: "category_order",
        value: orderedIds,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  } catch {
    // Ignore if table does not exist
  }

  // 2. Write to public/category-order.json
  try {
    await fs.writeFile(ORDER_FILE_PATH, JSON.stringify(orderedIds, null, 2), "utf-8");
  } catch {
    // Read-only serverless filesystem
  }

  // 3. Write to /tmp
  try {
    await fs.writeFile(TMP_ORDER_FILE_PATH, JSON.stringify(orderedIds, null, 2), "utf-8");
  } catch {
    // Ignore
  }

  return { ok: true };
}
