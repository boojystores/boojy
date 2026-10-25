"use server";

import fs from "fs/promises";
import path from "path";
import os from "os";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import {
  DEFAULT_PAYMENT_METHODS,
  type PaymentMethodConfig,
} from "@/features/checkout/lib/payment-methods";

const FILE_PATH = path.join(process.cwd(), "public", "payment-methods.json");
const TMP_FILE_PATH = path.join(os.tmpdir(), "payment-methods.json");

let memoryCache: PaymentMethodConfig[] | null = null;

/**
 * Retrieve all payment methods with their enabled/disabled status.
 * Order of precedence:
 * 1. Supabase store_settings (production persistent store)
 * 2. public/payment-methods.json
 * 3. /tmp/payment-methods.json
 * 4. In-memory cache or default list
 */
export async function getPaymentMethodsConfig(): Promise<PaymentMethodConfig[]> {
  // 1. Try Supabase store_settings
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("store_settings")
      .select("value")
      .eq("key", "payment_methods_config")
      .maybeSingle();

    if (!error && Array.isArray(data?.value) && data.value.length > 0) {
      memoryCache = data.value as PaymentMethodConfig[];
      return memoryCache;
    }
  } catch {
    // Ignore and fall through
  }

  // 2. Try public/payment-methods.json
  try {
    const raw = await fs.readFile(FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      memoryCache = parsed as PaymentMethodConfig[];
      return memoryCache;
    }
  } catch {
    // Ignore and fall through
  }

  // 3. Try /tmp
  try {
    const raw = await fs.readFile(TMP_FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      memoryCache = parsed as PaymentMethodConfig[];
      return memoryCache;
    }
  } catch {
    // Ignore
  }

  return memoryCache ?? DEFAULT_PAYMENT_METHODS;
}

/**
 * Persist payment methods configuration to Supabase store_settings,
 * local JSON, and /tmp, then revalidate checkout and admin pages.
 */
export async function savePaymentMethodsConfig(
  methods: PaymentMethodConfig[],
): Promise<{ ok: boolean; message?: string }> {
  memoryCache = methods;

  // 1. Save to Supabase store_settings (primary persistent store across serverless instances)
  try {
    const supabase = createServiceClient();
    await supabase.from("store_settings").upsert(
      {
        key: "payment_methods_config",
        value: methods,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  } catch (err) {
    console.warn("[Payments] Supabase store_settings write error:", err);
  }

  // 2. Write to public/payment-methods.json
  try {
    await fs.writeFile(FILE_PATH, JSON.stringify(methods, null, 2), "utf-8");
  } catch {
    // Read-only serverless filesystem
  }

  // 3. Write to /tmp
  try {
    await fs.writeFile(TMP_FILE_PATH, JSON.stringify(methods, null, 2), "utf-8");
  } catch {
    // Ignore
  }

  // Invalidate storefront and admin paths
  revalidatePath("/", "layout");
  revalidatePath("/checkout");
  revalidatePath("/admin/payments");
  revalidatePath("/admin");

  return { ok: true };
}

/**
 * Toggle a payment method ON or OFF.
 */
export async function togglePaymentMethodAction(
  id: string,
  enabled: boolean,
): Promise<{ ok: boolean; methods: PaymentMethodConfig[]; message?: string }> {
  const current = await getPaymentMethodsConfig();
  const updated = current.map((method) => {
    if (method.id === id) {
      return { ...method, enabled };
    }
    return method;
  });

  await savePaymentMethodsConfig(updated);
  return { ok: true, methods: updated };
}

/**
 * Update details (name, description, hint, badge, instructions) of a payment method.
 */
export async function updatePaymentMethodAction(
  id: string,
  updates: Partial<PaymentMethodConfig>,
): Promise<{ ok: boolean; methods: PaymentMethodConfig[]; message?: string }> {
  const current = await getPaymentMethodsConfig();
  const updated = current.map((method) => {
    if (method.id === id) {
      return { ...method, ...updates };
    }
    return method;
  });

  await savePaymentMethodsConfig(updated);
  return { ok: true, methods: updated };
}

/**
 * Add a new extensible payment method.
 */
export async function addPaymentMethodAction(
  newMethod: PaymentMethodConfig,
): Promise<{ ok: boolean; methods: PaymentMethodConfig[]; message?: string }> {
  const current = await getPaymentMethodsConfig();
  if (current.some((m) => m.id === newMethod.id)) {
    return { ok: false, methods: current, message: "A payment method with this ID already exists." };
  }

  const updated = [...current, newMethod];
  await savePaymentMethodsConfig(updated);
  return { ok: true, methods: updated };
}

/**
 * Delete a custom payment method. Core methods (bachs, ewallet, bank_transfer) cannot be deleted, only disabled.
 */
export async function deletePaymentMethodAction(
  id: string,
): Promise<{ ok: boolean; methods: PaymentMethodConfig[]; message?: string }> {
  if (["bachs", "ewallet", "bank_transfer"].includes(id)) {
    return { ok: false, methods: await getPaymentMethodsConfig(), message: "Core payment methods cannot be deleted. You can turn them OFF instead." };
  }

  const current = await getPaymentMethodsConfig();
  const updated = current.filter((m) => m.id !== id);
  await savePaymentMethodsConfig(updated);
  return { ok: true, methods: updated };
}
