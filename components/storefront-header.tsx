"use client";

import Link from "next/link";
import { StorefrontDrawer } from "@/components/storefront-drawer";
import { CatalogRefresh } from "@/features/catalog/components/catalog-refresh";
import { CartBadge } from "@/features/cart/components/cart-badge";
import { StorefrontNav } from "@/components/storefront-nav";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { BoojyLogo } from "@/components/boojy-logo";
import { useHeaderScroll } from "@/hooks/use-header-scroll";
import { cn } from "@/lib/utils";

// The storefront is guest-only (ADR-0001 / ADR-0007): it renders no auth UI
// whatsoever. Admins reach the dashboard through its own URL and sign in there.
export function StorefrontHeader() {
  const { isProductsPage, isHeaderHidden } = useHeaderScroll();

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-md transition-transform duration-300 ease-in-out",
        isProductsPage && isHeaderHidden ? "-translate-y-full" : "translate-y-0"
      )}
    >
      {/* Catalog sync (ADR-0010): polls the catalog while the tab is visible
          so Customers see Admin changes without reloading. Renders nothing. */}
      <CatalogRefresh />
      <div className="site-container relative flex h-16 md:h-20 items-center justify-between">
        {/* Left: Mobile hamburger drawer or Desktop nav links */}
        <div className="flex items-center gap-6">
          <div className="md:hidden">
            <StorefrontDrawer />
          </div>
          <StorefrontNav />
        </div>

        {/* Center: Logo in the middle */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
          <Link
            href="/"
            aria-label="Boojy Home"
            className="flex items-center transition-opacity hover:opacity-80"
          >
            <BoojyLogo className="h-7 sm:h-8 w-auto" priority />
          </Link>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeSwitcher />
          <CartBadge />
        </div>
      </div>
    </header>
  );
}
