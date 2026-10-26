"use server";

import { createClient } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/assert-admin";
import {
  createCategory,
  deleteCategory,
  renameCategory,
  type CategoryMutationResult,
  type DeleteCategoryResult,
} from "@/features/admin/lib/categories/categories";

/**
 * Category write actions (ticket 08). The RLS admin policies on `categories`
 * and assertAdmin() are the security boundary.
 */

export async function createCategoryAction(
  name: string,
): Promise<CategoryMutationResult> {
  await assertAdmin();
  const supabase = await createClient();
  return createCategory(supabase, name);
}

export async function renameCategoryAction(
  id: string,
  name: string,
): Promise<CategoryMutationResult> {
  await assertAdmin();
  const supabase = await createClient();
  return renameCategory(supabase, id, name);
}

export async function deleteCategoryAction(
  id: string,
): Promise<DeleteCategoryResult> {
  await assertAdmin();
  const supabase = await createClient();
  return deleteCategory(supabase, id);
}

export async function getCategoryOrderAction(): Promise<string[]> {
  const { getCategoryOrder } = await import("@/features/catalog/lib/category-order.server");
  return getCategoryOrder();
}

export async function saveCategoryOrderAction(
  orderedIds: string[],
): Promise<{ ok: boolean }> {
  await assertAdmin();
  const { saveCategoryOrder } = await import("@/features/catalog/lib/category-order.server");
  const { revalidatePath } = await import("next/cache");
  const res = await saveCategoryOrder(orderedIds);
  revalidatePath("/", "layout");
  revalidatePath("/");
  revalidatePath("/products");
  revalidatePath("/admin/categories");
  return res;
}

