"use client";

import Link from "next/link";
import { ShoppingBag, XCircle } from "lucide-react";
import type { Category, Product } from "@/features/catalog/lib/catalog";
import { formatPrice } from "@/lib/currency";

export function ProductCard({
  product,
  categories,
}: {
  product: Product;
  categories?: Category[];
}) {
  const outOfStock = product.stock_quantity === 0;
  const categoryName =
    categories?.find((c) => c.id === product.category_id)?.name ?? null;

  function handleAddToCart(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (outOfStock) return;
    window.location.href = `/products/${product.id}`;
  }

  return (
    <Link
      href={`/products/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element -- remote images from seed/Storage */}
        <img
          src={product.image_url}
          alt={product.name}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {outOfStock && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-xs font-medium text-destructive-foreground">
            <XCircle className="h-3 w-3" />
            Out of stock
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        {categoryName && (
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {categoryName}
          </p>
        )}
        <h3 className="line-clamp-2 font-sans text-sm font-medium leading-snug">
          {product.name}
        </h3>
        <p className="mt-auto pt-1 font-display text-base font-bold tabular-nums">
          {formatPrice(product.price)}
        </p>
        <div className="mt-2">
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={outOfStock}
            aria-label={outOfStock ? `${product.name} is out of stock` : `Add ${product.name} to bag - select size`}
            className={`flex w-full items-center justify-center gap-2 rounded-md py-2 px-3 text-xs font-semibold uppercase tracking-wider transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
              outOfStock
                ? "cursor-not-allowed bg-muted text-muted-foreground"
                : "bg-black text-white shadow-sm hover:bg-neutral-800 active:scale-[0.99]"
            }`}
          >
            {outOfStock ? (
              <>
                <XCircle className="h-3.5 w-3.5" />
                Out of Stock
              </>
            ) : (
              <>
                <ShoppingBag className="h-3.5 w-3.5 stroke-[2]" />
                Add to Bag
              </>
            )}
          </button>
        </div>
      </div>
    </Link>
  );
}
