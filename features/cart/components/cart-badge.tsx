"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { cartCount, useCartStore } from "@/features/cart/lib/cart";

/**
 * Header shopping bag link with a live unit-count badge. SSR-safe: the persisted store
 * only hydrates on the client, so the badge renders once hydrated.
 */
export function CartBadge({ className }: { className?: string }) {
  const items = useCartStore((state) => state.items);
  const hasHydrated = useCartStore((state) => state.hasHydrated);
  const pathname = usePathname();

  const count = hasHydrated ? cartCount(items) : 0;
  const showBadge = hasHydrated && count > 0;
  const isCart = pathname === "/cart";

  return (
    <Link
      href="/cart"
      className={`relative inline-flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-none transition-colors hover:bg-muted hover:text-foreground ${isCart ? "text-foreground" : "text-muted-foreground"} ${className ?? ""}`}
      aria-label={`Shopping bag, ${count} ${count === 1 ? "item" : "items"}`}
    >
      <ShoppingBag className="h-5 w-5 sm:h-6 sm:w-6 stroke-[1.8]" />
      {showBadge && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 sm:h-4.5 sm:min-w-4.5 items-center justify-center rounded-full bg-primary px-1 text-[10px] sm:text-[11px] font-semibold leading-none text-primary-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
