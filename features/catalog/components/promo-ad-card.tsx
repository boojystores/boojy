"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { PromoCardConfig } from "@/features/catalog/lib/promo-card";
import { cn } from "@/lib/utils";

export function PromoAdCard({
  config,
  className,
}: {
  config: PromoCardConfig;
  className?: string;
}) {
  if (!config.enabled) return null;

  return (
    <div
      className={cn(
        "group relative col-span-2 sm:col-span-1 w-full flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-black text-white shadow-md transition-all duration-300 hover:-translate-y-1 hover:border-primary/60 hover:shadow-xl",
        "min-h-[250px] sm:min-h-[380px] p-5 sm:p-6",
        className,
      )}
    >
      {/* Background Image / Texture with dark gradient overlay */}
      {config.imageUrl ? (
        <div className="absolute inset-0 -z-20 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={config.imageUrl}
            alt={config.title}
            className="h-full w-full object-cover opacity-40 transition-transform duration-700 ease-out group-hover:scale-105"
          />
        </div>
      ) : null}

      {/* Luxury atmospheric gradients */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black via-black/75 to-transparent" />
      <div className="absolute -right-12 -top-12 -z-10 h-40 w-40 rounded-full bg-primary/20 blur-3xl transition-opacity group-hover:opacity-100 opacity-60" />

      {/* Top: Badge / Tag */}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-none border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white backdrop-blur-md">
          <Sparkles className="h-3 w-3 text-amber-400" />
          {config.badge || "FEATURED EVENT"}
        </span>
      </div>

      {/* Center & Bottom Content */}
      <div className="mt-auto space-y-3 pt-6">
        <h3 className="font-display text-xl sm:text-2xl md:text-3xl font-extrabold uppercase leading-tight tracking-wide text-white drop-shadow-sm">
          {config.title}
        </h3>

        {config.description ? (
          <p className="line-clamp-3 text-xs sm:text-sm text-neutral-300 leading-relaxed font-normal">
            {config.description}
          </p>
        ) : null}

        <div className="pt-2">
          <Link
            href={config.buttonLink || "/products"}
            className="inline-flex w-full items-center justify-center gap-2 rounded-none bg-white text-black px-4 py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wider shadow-sm transition-colors hover:bg-neutral-200"
          >
            <span>{config.buttonText || "ENTER NOW"}</span>
            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </div>
  );
}
