"use client";

import { Truck, Clock, ShieldAlert, CheckCircle2, Store } from "lucide-react";
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

export function ShippingMethodSelector({
  options,
  selectedMethodId,
  onSelect,
  loading = false,
  hasDestination,
  destinationSummary,
}: ShippingMethodSelectorProps) {
  if (!hasDestination) {
    return (
      <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 p-6 text-center">
        <Truck className="mx-auto h-8 w-8 text-muted-foreground/60" />
        <p className="mt-2 text-sm font-medium text-foreground">
          Select Delivery Destination
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose your State and Local Government Area above to view available delivery methods and exact pricing.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/20 p-6 text-center animate-pulse">
        <div className="mx-auto h-6 w-32 rounded bg-muted" />
        <div className="mt-4 space-y-2">
          <div className="h-12 w-full rounded-lg bg-muted/60" />
          <div className="h-12 w-full rounded-lg bg-muted/60" />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Calculating verified delivery rates…
        </p>
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-700 dark:text-amber-400">
        <div className="flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-sm">Delivery Currently Unavailable</h3>
            <p className="mt-1 text-xs leading-relaxed opacity-90">
              We do not currently offer automated delivery to {destinationSummary || "the selected location"}.
              Please check your address or contact customer support on WhatsApp for custom courier arrangements.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" role="radiogroup" aria-label="Available delivery methods">
      {options.map((opt) => {
        const isSelected = opt.methodId === selectedMethodId;
        const Icon = opt.methodType === "pickup" ? Store : Truck;

        return (
          <label
            key={opt.methodId}
            onClick={() => onSelect(opt)}
            className={cn(
              "flex cursor-pointer items-start justify-between gap-4 rounded-xl border p-4 transition-all duration-200",
              isSelected
                ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30"
                : "border-border/60 bg-card/10 hover:border-border hover:bg-card/20",
            )}
          >
            <div className="flex items-start gap-3.5">
              <input
                type="radio"
                name="shippingOption"
                checked={isSelected}
                onChange={() => onSelect(opt)}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {opt.methodName}
                  </span>
                  {opt.isFree && (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      Free Shipping
                    </span>
                  )}
                  {opt.scope === "zone" && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      Zone Rate
                    </span>
                  )}
                </div>

                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                  {opt.description}
                </p>

                <div className="mt-2 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>
                    {opt.estimatedMinDays === 0
                      ? "Same day / Available immediately"
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
