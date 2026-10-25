"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function StorefrontNav() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isProducts = pathname.startsWith("/products");
  const isTrack = pathname === "/track";

  return (
    <nav className="hidden items-center gap-5 md:flex lg:gap-8 font-display" aria-label="Store">
      <Link
        href="/"
        className={`relative text-sm md:text-base lg:text-lg font-bold uppercase tracking-wider transition-colors hover:text-foreground font-display ${
          isHome
            ? "text-foreground font-extrabold"
            : "text-muted-foreground/80 hover:text-foreground"
        }`}
      >
        Home
      </Link>
      <Link
        href="/products"
        className={`relative text-sm md:text-base lg:text-lg font-bold uppercase tracking-wider transition-colors hover:text-foreground font-display ${
          isProducts
            ? "text-foreground font-extrabold"
            : "text-muted-foreground/80 hover:text-foreground"
        }`}
      >
        All Products
      </Link>
      <Link
        href="/track"
        className={`relative text-sm md:text-base lg:text-lg font-bold uppercase tracking-wider transition-colors hover:text-foreground font-display ${
          isTrack
            ? "text-foreground font-extrabold"
            : "text-muted-foreground/80 hover:text-foreground"
        }`}
      >
        Track Order
      </Link>
    </nav>
  );
}
