"use client";

import React from "react";
import { useHeaderScroll } from "@/hooks/use-header-scroll";
import { cn } from "@/lib/utils";

export function StickyCatalogToolbar({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isHeaderHidden } = useHeaderScroll();

  return (
    <div
      className={cn(
        "sticky z-30 w-full max-w-full border-b border-border bg-background/95 backdrop-blur-md shadow-sm transition-[top] duration-300 ease-in-out",
        isHeaderHidden ? "top-0" : "top-16 md:top-20"
      )}
    >
      {children}
    </div>
  );
}
