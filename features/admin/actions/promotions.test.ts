import { describe, expect, it, vi, beforeEach } from "vitest";
import fs from "fs/promises";
import { getPromoConfig, savePromoConfig } from "./promotions";
import { DEFAULT_PROMO_CONFIG, type PromoCardConfig } from "@/features/catalog/lib/promo-card";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockUpsert = vi.fn().mockResolvedValue({ error: null });
const mockSelect = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({
      upsert: mockUpsert,
      select: () => ({
        eq: () => ({
          maybeSingle: mockSelect,
        }),
      }),
    }),
  }),
}));

describe("Promotions Action (Serverless-Safe Persistence)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("safely saves promo config even when filesystem throws EROFS (read-only file system)", async () => {
    // Simulate Vercel / Lambda read-only file system
    vi.spyOn(fs, "writeFile").mockImplementation(async (targetPath) => {
      if (typeof targetPath === "string" && targetPath.includes("public")) {
        const err = new Error("EROFS: read-only file system, open '/var/task/public/promo-card.json'");
        (err as Record<string, unknown>).code = "EROFS";
        throw err;
      }
      return Promise.resolve();
    });

    const newConfig: PromoCardConfig = {
      ...DEFAULT_PROMO_CONFIG,
      title: "SUMMER DROP",
      badge: "EXCLUSIVE",
    };

    const res = await savePromoConfig(newConfig);
    expect(res.ok).toBe(true);
    expect(res.error).toBeUndefined();

    // Verified it saved to Supabase store_settings
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "promo_card_config",
        value: newConfig,
      }),
      { onConflict: "key" },
    );
  });

  it("reads config from Supabase store_settings when present", async () => {
    const customConfig: PromoCardConfig = {
      ...DEFAULT_PROMO_CONFIG,
      title: "CYBER WEEKEND",
    };

    mockSelect.mockResolvedValueOnce({
      data: { value: customConfig },
      error: null,
    });

    const config = await getPromoConfig();
    expect(config.title).toBe("CYBER WEEKEND");
  });
});
