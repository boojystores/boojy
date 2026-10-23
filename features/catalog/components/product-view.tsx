"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCartStore } from "@/features/cart/lib/cart";
import {
  cleanProductDescription,
  type Category,
  type Product,
} from "@/features/catalog/lib/catalog";

export function ProductView({
  product,
}: {
  product: Product;
  categories: Category[];
}) {
  const addItem = useCartStore((state) => state.addItem);

  const [quantity, setQuantity] = useState(1);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [shippingOpen, setShippingOpen] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const outOfStock = product.stock_quantity === 0;
  const maxQuantity = Math.max(1, product.stock_quantity);

  // Gallery images support
  const galleryImages = [product.image_url];

  useEffect(() => {
    return () => {
      if (addedTimer.current) clearTimeout(addedTimer.current);
    };
  }, []);

  function handleAddToCart() {
    if (outOfStock) return;
    addItem(product, quantity);
    setJustAdded(true);
    if (addedTimer.current) clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setJustAdded(false), 1600);
  }

  const cleanDescription = cleanProductDescription(product.description);

  // Format price: e.g. ₦400,000.00
  const formattedPrice = `₦${product.price.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  return (
    <div className="site-container py-6 sm:py-8 lg:py-10">
      {/* 2-Column Product Layout: 7 cols gallery (increased image size) + 5 cols info */}
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-12 items-start">
        {/* Left Column: Product Gallery with Increased Image Size */}
        <div className="lg:col-span-7 flex flex-col items-center">
          {/* Main Visual Stage: Increased size, image fits frame cleanly */}
          <div className="group relative aspect-square w-full max-w-[540px] lg:max-w-[620px] overflow-hidden border border-border/60 bg-[#f4f2ee] dark:bg-muted/15 flex items-center justify-center rounded-none shadow-xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={galleryImages[selectedImageIndex] || product.image_url}
              alt={product.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />

            {/* Left Navigation Button: Visible on mobile, appears on hover on desktop */}
            <button
              type="button"
              onClick={() =>
                setSelectedImageIndex((prev) =>
                  prev > 0 ? prev - 1 : galleryImages.length - 1,
                )
              }
              aria-label="Previous image"
              className={cn(
                "absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center",
                "border border-border/80 bg-background/90 text-foreground shadow-xs rounded-none transition-all duration-200 hover:bg-background",
                "opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:pointer-events-none lg:group-hover:pointer-events-auto",
              )}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            {/* Right Navigation Button: Visible on mobile, appears on hover on desktop */}
            <button
              type="button"
              onClick={() =>
                setSelectedImageIndex((prev) =>
                  prev < galleryImages.length - 1 ? prev + 1 : 0,
                )
              }
              aria-label="Next image"
              className={cn(
                "absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center",
                "border border-border/80 bg-background/90 text-foreground shadow-xs rounded-none transition-all duration-200 hover:bg-background",
                "opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:pointer-events-none lg:group-hover:pointer-events-auto",
              )}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Bottom Thumbnails Strip */}
          <div className="flex w-full max-w-[540px] lg:max-w-[620px] items-center gap-2.5 pt-3 overflow-x-auto">
            {galleryImages.map((imgUrl, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setSelectedImageIndex(idx)}
                className={cn(
                  "relative h-16 w-14 sm:h-18 sm:w-16 shrink-0 overflow-hidden bg-[#f4f2ee] dark:bg-muted/20 transition-all rounded-none",
                  selectedImageIndex === idx
                    ? "border-2 border-foreground shadow-xs"
                    : "border border-border/70 opacity-70 hover:opacity-100",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgUrl}
                  alt={`${product.name} thumbnail ${idx + 1}`}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>

        {/* Right Column: Product Info & Purchase Panel */}
        <div className="lg:col-span-5 flex flex-col gap-5 sm:gap-6">
          {/* Title & Price Header */}
          <div className="space-y-2">
            <h1 className="font-display text-xl sm:text-2xl md:text-3xl font-bold uppercase tracking-wide text-foreground">
              {product.name}
            </h1>
            <div className="flex items-center gap-3">
              <span className="text-base sm:text-lg font-semibold font-mono text-foreground">
                {formattedPrice}
              </span>
              {outOfStock ? (
                <span className="rounded-none bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-destructive">
                  Out of stock
                </span>
              ) : product.stock_quantity <= 5 ? (
                <span className="rounded-none bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Only {product.stock_quantity} left
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="underline underline-offset-2">Shipping</span> Calculated At Checkout.
            </p>
          </div>

          {/* Actions: Quantity Stepper on line 1, Add to Bag on line 2 */}
          <div className="space-y-3 pt-1">
            {/* Line 1: Quantity Stepper */}
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-foreground block mb-2">
                Quantity
              </span>
              <div className="flex h-11 w-32 items-stretch border border-border bg-background rounded-none">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1 || outOfStock}
                  aria-label="Decrease quantity"
                  className="flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <div className="flex flex-1 items-center justify-center text-xs font-semibold font-mono text-foreground select-none">
                  {quantity}
                </div>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                  disabled={quantity >= maxQuantity || outOfStock}
                  aria-label="Increase quantity"
                  className="flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Line 2: Full-Width Add To Bag Button */}
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={outOfStock}
              className={cn(
                "w-full h-12 flex items-center justify-center gap-2",
                "bg-black hover:bg-neutral-900 text-white text-xs sm:text-sm font-bold uppercase tracking-widest transition-colors rounded-none shadow-sm border border-black",
                outOfStock && "opacity-50 cursor-not-allowed",
                justAdded && "bg-emerald-600 hover:bg-emerald-600 border-emerald-600",
              )}
            >
              {justAdded ? (
                <>
                  <Check className="h-4 w-4" />
                  <span>ADDED TO BAG</span>
                </>
              ) : outOfStock ? (
                "OUT OF STOCK"
              ) : (
                <>
                  <ShoppingBag className="h-4 w-4 stroke-[1.8]" />
                  <span>ADD TO BAG</span>
                </>
              )}
            </button>
          </div>

          {/* Free Shipping Perk: 100k */}
          <div className="flex items-center gap-2 text-xs text-foreground/80 pt-0.5">
            <Truck className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>Complimentary shipping on orders over ₦100k</span>
          </div>

          {/* Description */}
          {cleanDescription && (
            <div className="text-xs sm:text-sm text-foreground/85 leading-relaxed font-normal pt-1">
              {cleanDescription}
            </div>
          )}

          {/* Shipping And Returns Collapsible Accordion */}
          <div className="border-t border-border pt-3 mt-1">
            <button
              type="button"
              onClick={() => setShippingOpen((prev) => !prev)}
              className="flex w-full items-center justify-between py-1.5 text-xs font-semibold uppercase tracking-wider text-foreground hover:text-foreground/80 transition-colors"
            >
              <span>Shipping And Returns</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform duration-200",
                  shippingOpen && "rotate-180",
                )}
              />
            </button>
            {shippingOpen && (
              <div className="pt-2 pb-3 text-xs text-muted-foreground leading-relaxed space-y-1.5 animate-in fade-in duration-150">
                <p>• Standard domestic shipping across Nigeria within 2–4 business days.</p>
                <p>• Express priority dispatch available for same-day delivery in select areas.</p>
                <p>• Hassle-free exchanges or returns within 7 calendar days of delivery for eligible items in original, unworn condition.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
