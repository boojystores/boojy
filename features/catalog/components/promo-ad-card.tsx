"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
        "group relative col-span-2 sm:col-span-1 w-full flex flex-col justify-end overflow-hidden rounded-xl border border-border bg-card text-white shadow-md transition-all duration-300 hover:-translate-y-1 hover:border-primary/60 hover:shadow-xl",
        "min-h-[250px] sm:min-h-[380px] p-5 sm:p-6",
        className,
      )}
    >
      {/* Background Image — full visibility, no darkening overlay covering the photo */}
      {config.imageUrl ? (
        <div className="absolute inset-0 -z-20 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={config.imageUrl}
            alt={config.title}
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
        </div>
      ) : null}

      {/* Bottom blur overlay so text at the bottom is clear and readable without blacking out the rest of the image */}
      <div className="absolute inset-x-0 bottom-0 -z-10 h-3/5 bg-gradient-to-t from-black/85 via-black/45 to-transparent backdrop-blur-sm" />

      {/* Bottom Content */}
      <div className="space-y-3">
        <h3 className="font-display text-xl sm:text-2xl md:text-3xl font-extrabold uppercase leading-tight tracking-wide text-white drop-shadow-md">
          {config.title}
        </h3>

        {config.description ? (
          <p className="line-clamp-3 text-xs sm:text-sm text-neutral-200 leading-relaxed font-medium drop-shadow-sm">
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
