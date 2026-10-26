"use client";

import { Package, Clock, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { priceFormatter } from "@/lib/currency";
import type { ShippingOption } from "../types";

interface ShippingMethodSelectorProps {
  options: ShippingOption[];
  selectedMethodId?: string;
  onSelect: (option: ShippingOption) => void;
  loading?: boolean;
  hasDestination: boolean;
  destinationSummary?: string;
}

function getCleanDeliveryName(opt: ShippingOption, totalOptions: number): string {
  if (opt.methodId === "express" || opt.methodName.toLowerCase().includes("express")) {
    return "Express Delivery";
  }
  if (totalOptions > 1) {
    return "Standard Delivery";
  }
  return "Delivery";
}

function getCleanDeliveryDesc(opt: ShippingOption): string {
  if (opt.methodId === "express" || opt.methodName.toLowerCase().includes("express")) {
    return "Priority delivery to your doorstep";
  }
  return "Direct delivery to your doorstep";
}

export function ShippingMethodSelector({
  options,
  selectedMethodId,
  onSelect,
  loading = false,
  hasDestination,
  destinationSummary,
}: ShippingMethodSelectorProps) {
  // Only display delivery/shipping options (Pickup is handled by the top-level toggle)
  const deliveryOptions = options.filter((o) => o.methodType !== "pickup");

  if (!hasDestination) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-4 text-center">
        <Package className="mx-auto h-6 w-6 text-muted-foreground/60" />
        <p className="mt-2 text-xs font-medium text-foreground">
          Enter Your Delivery Address Above
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Select your state and LGA to view your exact delivery fee.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/20 p-4 text-center animate-pulse">
        <div className="mx-auto h-4 w-28 rounded bg-muted" />
        <div className="mt-3 h-12 w-full rounded-lg bg-muted/50" />
        <p className="mt-2 text-[11px] text-muted-foreground">
          Calculating delivery fee…
        </p>
      </div>
    );
  }

  if (deliveryOptions.length === 0) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-400">
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-xs">Delivery Unavailable</h3>
            <p className="mt-0.5 text-[11px] leading-relaxed opacity-90">
              We do not currently offer automated delivery to {destinationSummary || "the selected location"}.
              You can choose Store Pickup or contact support on WhatsApp.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5" role="radiogroup" aria-label="Delivery options">
      {deliveryOptions.map((opt) => {
        const isSelected = opt.methodId === selectedMethodId;
        const displayName = getCleanDeliveryName(opt, deliveryOptions.length);
        const displayDesc = getCleanDeliveryDesc(opt);

        return (
          <label
            key={opt.methodId}
            onClick={() => onSelect(opt)}
            className={cn(
              "flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3.5 transition-all duration-200",
              isSelected
                ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30"
                : "border-border/60 bg-card/10 hover:border-border hover:bg-card/20",
            )}
          >
            <div className="flex items-center gap-3">
              <input
                type="radio"
                name="shippingOption"
                checked={isSelected}
                onChange={() => onSelect(opt)}
                className="h-4 w-4 accent-primary"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {displayName}
                  </span>
                  {opt.isFree && (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      Free Delivery
                    </span>
                  )}
                </div>

                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{displayDesc}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1 font-medium">
                    <Clock className="h-3 w-3" />
                    {opt.estimatedMinDays === 0
                      ? "Same day"
                      : `${opt.estimatedMinDays}–${opt.estimatedMaxDays} business days`}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="text-sm font-bold tabular-nums text-foreground">
                {opt.isFree || opt.priceNaira === 0
                  ? "FREE"
                  : priceFormatter.format(opt.priceNaira)}
              </span>
            </div>
          </label>
        );
      })}
    </div>
  );
}
