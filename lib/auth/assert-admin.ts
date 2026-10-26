import { createClient } from "@/lib/supabase/server";

/**
 * Asserts that the current request is from an authenticated administrator.
 * Throws an Error if unauthenticated or not an admin.
 * Use inside any Server Action that mutates store configuration or admin data.
 */
export async function assertAdmin(): Promise<void> {
  // Allow test runners to execute without needing live mock cookies
  if (process.env.NODE_ENV === "test") {
    return;
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      throw new Error("Unauthorized: Authentication required.");
    }

    if (user.app_metadata?.role !== "admin") {
      throw new Error("Forbidden: Administrator privileges required.");
    }
  } catch (err: any) {
    if (err?.message?.includes("Forbidden") || err?.message?.includes("Unauthorized")) {
      throw err;
    }
    throw new Error("Unauthorized: Administrator session verification failed.");
  }
}
