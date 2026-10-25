"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PromoAdCard } from "@/features/catalog/components/promo-ad-card";
import {
  savePromoConfig,
  uploadPromoBannerAction,
} from "@/features/admin/actions/promotions";
import type { PromoCardConfig } from "@/features/catalog/lib/promo-card";

const PRESET_IMAGES = [
  {
    name: "Dark Luxury Streetwear",
    url: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&fit=crop",
  },
  {
    name: "Minimalist Black & White",
    url: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800&fit=crop",
  },
  {
    name: "Urban Fashion Smoke",
    url: "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&fit=crop",
  },
  {
    name: "Moody Leather & Aesthetic",
    url: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800&fit=crop",
  },
];

export function PromotionsManager({
  initialConfig,
}: {
  initialConfig: PromoCardConfig;
}) {
  const [config, setConfig] = useState<PromoCardConfig>(initialConfig);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBannerUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setError(null);
    try {
      const data = new FormData();
      data.set("file", file);
      const res = await uploadPromoBannerAction(data);
      if (res.ok) {
        setConfig((c) => ({ ...c, imageUrl: res.url }));
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploadingImage(false);
      e.target.value = "";
    }
  }

  async function handleToggle(newEnabled: boolean) {
    const updated = { ...config, enabled: newEnabled };
    setConfig(updated);
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await savePromoConfig(updated);
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(res.error || "Failed to update promotion status.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const res = await savePromoConfig(config);
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(res.error || "Failed to save promotions settings.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight">
          In-Grid Promotions & Ads
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure promotional campaign cards (e.g. Black Friday, drops, sales) that display inside the storefront product catalog grid.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Form Settings (7 cols) */}
        <form onSubmit={handleSubmit} className="lg:col-span-7 space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-6">
            {/* Enable Toggle */}
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor="enabled-toggle" className="text-base font-semibold cursor-pointer">
                    Enable In-Grid Card
                  </Label>
                  {config.enabled ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      Live on Storefront
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      Off (Hidden)
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Display this promotional card inside the product grid
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  id="enabled-toggle"
                  type="checkbox"
                  checked={config.enabled}
                  disabled={saving}
                  onChange={(e) => handleToggle(e.target.checked)}
                  className="peer sr-only"
                />
                <div className="h-6 w-11 rounded-full bg-muted peer-checked:bg-primary transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full" />
              </label>
            </div>

            {/* Campaign Title */}
            <div className="space-y-2">
              <Label htmlFor="promo-title">Card Headline / Title</Label>
              <Input
                id="promo-title"
                value={config.title}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, title: e.target.value }))
                }
                placeholder="e.g. BLACK FRIDAY"
                required
              />
              <p className="text-xs text-muted-foreground">
                The primary display headline rendered in bold typography.
              </p>
            </div>

            {/* Event Badge */}
            <div className="space-y-2">
              <Label htmlFor="promo-badge">Badge / Pill Text</Label>
              <Input
                id="promo-badge"
                value={config.badge}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, badge: e.target.value }))
                }
                placeholder="e.g. LIMITED EVENT"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="promo-desc">Description / Offer Text</Label>
              <textarea
                id="promo-desc"
                rows={3}
                value={config.description}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, description: e.target.value }))
                }
                placeholder="e.g. Up to 50% off select streetwear and joggers..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            {/* Button Text & Link */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="promo-btn-text">Button Text</Label>
                <Input
                  id="promo-btn-text"
                  value={config.buttonText}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, buttonText: e.target.value }))
                  }
                  placeholder="e.g. ENTER NOW or SHOP NOW"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="promo-btn-link">Button Target URL</Label>
                <Input
                  id="promo-btn-link"
                  value={config.buttonLink}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, buttonLink: e.target.value }))
                  }
                  placeholder="/products or /products?category=..."
                  required
                />
              </div>
            </div>

            {/* Grid Slot Placement */}
            <div className="space-y-2">
              <Label htmlFor="promo-grid-pos">Grid Placement Slot</Label>
              <select
                id="promo-grid-pos"
                value={config.gridPosition}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    gridPosition: parseInt(e.target.value, 10),
                  }))
                }
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value={2}>Slot 2 (After 2nd product)</option>
                <option value={3}>Slot 3 (After 3rd product — Recommended)</option>
                <option value={4}>Slot 4 (After 4th product)</option>
                <option value={6}>Slot 6 (After 6th product)</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Determines which slot in the catalog grid will host this advertisement card.
              </p>
            </div>

            {/* Background Image URL, File Upload & Presets */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="promo-img-url">Background Image</Label>
                {uploadingImage && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Uploading to Cloudinary…
                  </span>
                )}
              </div>

              <div className="flex gap-2">
                <Input
                  id="promo-img-url"
                  value={config.imageUrl}
                  onChange={(e) =>
                    setConfig((c) => ({ ...c, imageUrl: e.target.value }))
                  }
                  placeholder="https://... or upload photo"
                  className="flex-1"
                />
                <label className="inline-flex cursor-pointer items-center justify-center border border-input bg-background px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors hover:bg-accent shrink-0">
                  <span>{uploadingImage ? "Uploading…" : "Upload Photo"}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploadingImage}
                    onChange={handleBannerUpload}
                    className="sr-only"
                  />
                </label>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Or select a curated luxury preset:
                </p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_IMAGES.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() =>
                        setConfig((c) => ({ ...c, imageUrl: preset.url }))
                      }
                      className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                        config.imageUrl === preset.url
                          ? "border-primary bg-primary/10 text-primary font-semibold"
                          : "border-border bg-muted/40 hover:bg-muted text-foreground"
                      }`}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Submit & Status */}
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-xs font-medium text-destructive">
                {error}
              </div>
            )}

            <div className="flex items-center gap-4 pt-2">
              <Button type="submit" disabled={saving} className="px-6">
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>

              {saved && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <Check className="h-4 w-4" />
                  Saved and updated on storefront!
                </span>
              )}
            </div>
          </div>
        </form>

        {/* Live Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              Live Storefront Preview
            </h2>
            <span className="text-xs text-muted-foreground">
              {config.enabled ? "Active" : "Disabled (Hidden)"}
            </span>
          </div>

          <div className="rounded-xl border border-dashed border-border p-4 bg-muted/20">
            {config.enabled ? (
              <div className="max-w-sm mx-auto">
                <PromoAdCard config={config} />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <p className="text-sm font-medium">Card is currently disabled.</p>
                <p className="text-xs mt-1">Toggle the switch above to show it on the storefront.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
