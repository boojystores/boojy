import fs from "fs/promises";
import path from "path";
import os from "os";

const ORDER_FILE_PATH = path.join(process.cwd(), "public", "category-order.json");
const TMP_ORDER_FILE_PATH = path.join(os.tmpdir(), "category-order.json");

let memoryOrderCache: string[] | null = null;

export async function getCategoryOrder(): Promise<string[]> {
  // 1. Try public/category-order.json
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

  // 2. Try /tmp
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

  // 1. Write to public/category-order.json
  try {
    await fs.writeFile(ORDER_FILE_PATH, JSON.stringify(orderedIds, null, 2), "utf-8");
  } catch {
    // Read-only serverless filesystem
  }

  // 2. Write to /tmp
  try {
    await fs.writeFile(TMP_ORDER_FILE_PATH, JSON.stringify(orderedIds, null, 2), "utf-8");
  } catch {
    // Ignore
  }

  return { ok: true };
}
