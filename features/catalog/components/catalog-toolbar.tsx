"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Filter,
  Layers,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isValidSort,
  parseCategorySlugs,
  type Category,
  type CatalogSort,
} from "@/features/catalog/lib/catalog";

const SORT_OPTIONS: { value: CatalogSort; label: string; shortLabel: string }[] = [
  { value: "featured", label: "Featured", shortLabel: "FEATURED" },
  { value: "relevant", label: "Most Relevant", shortLabel: "MOST RELEVANT" },
  { value: "best-selling", label: "Best Selling", shortLabel: "BEST SELLING" },
  { value: "title-asc", label: "Alphabetically, A-Z", shortLabel: "A–Z" },
  { value: "title-desc", label: "Alphabetically, Z-A", shortLabel: "Z–A" },
  { value: "price-asc", label: "Price, Low To High", shortLabel: "PRICE: LOW TO HIGH" },
  { value: "price-desc", label: "Price, High To Low", shortLabel: "PRICE: HIGH TO LOW" },
  { value: "created-asc", label: "Date, Old To New", shortLabel: "DATE: OLD TO NEW" },
  { value: "created-desc", label: "Date, New To Old", shortLabel: "DATE: NEW TO OLD" },
];

const PRICE_MIN_BOUND = 0;
const PRICE_MAX_BOUND = 1600000;
const PRICE_STEP = 5000;

/**
 * The catalog toolbar: provides edge-to-edge split toolbar with
 * [FILTERS] (opens left slide-over sidebar), [CATEGORIES], active filter chips,
 * and custom [SORT BY] dropdown that adapts to our UI.
 */
export function CatalogToolbar({
  categories,
  totalCount = 0,
}: {
  categories: Category[];
  totalCount?: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const categoryParam = searchParams.get("category") ?? "";
  const selectedSlugs = parseCategorySlugs(categoryParam);
  const activeCategories = categories.filter((c) => selectedSlugs.includes(c.slug));

  const rawSort = searchParams.get("sort");
  const sort: CatalogSort = isValidSort(rawSort) ? rawSort : "featured";
  const stock = searchParams.get("stock") ?? "";
  const minPrice = searchParams.get("minPrice") ?? "";
  const maxPrice = searchParams.get("maxPrice") ?? "";

  const [minDraft, setMinDraft] = useState(minPrice);
  const [maxDraft, setMaxDraft] = useState(maxPrice);

  // Panels: sidebar for filters, drawer for categories
  const [isFilterSidebarOpen, setIsFilterSidebarOpen] = useState(false);
  const [isCategoriesDrawerOpen, setIsCategoriesDrawerOpen] = useState(false);
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);

  // Accordion sections inside filter sidebar (Availability & Price per reference design)
  const [availabilityOpen, setAvailabilityOpen] = useState(true);
  const [priceOpen, setPriceOpen] = useState(true);

  const priceDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMount = useRef(true);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const latestParamsRef = useRef(searchParams);
  latestParamsRef.current = searchParams;

  // Active filter state
  const hasActiveFilters = Boolean(
    q || selectedSlugs.length > 0 || stock || minPrice || maxPrice,
  );

  function handleSelectCategory(slug: string) {
    if (selectedSlugs.includes(slug)) {
      updateParams({ category: "" });
    } else {
      updateParams({ category: slug });
    }
  }

  function clearCategories() {
    updateParams({ category: "" });
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        sortDropdownRef.current &&
        !sortDropdownRef.current.contains(event.target as Node)
      ) {
        setIsSortDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Lock body scroll when sidebar is open
  useEffect(() => {
    if (isFilterSidebarOpen) {
      document.body.style.overflow = "hidden";
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") setIsFilterSidebarOpen(false);
      };
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isFilterSidebarOpen]);

  useEffect(() => {
    setMinDraft(minPrice);
  }, [minPrice]);

  useEffect(() => {
    setMaxDraft(maxPrice);
  }, [maxPrice]);

  function updateParams(
    changes: {
      q?: string;
      category?: string;
      sort?: string;
      stock?: string;
      minPrice?: string;
      maxPrice?: string;
    },
    base: URLSearchParams = searchParams,
  ) {
    const params = new URLSearchParams(base);
    for (const [key, value] of Object.entries(changes)) {
      if (value !== undefined && value !== "") params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `/products?${qs}` : "/products");
  }

  // Debounce price slider/input changes to URL so the item count updates dynamically
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (priceDebounceRef.current) clearTimeout(priceDebounceRef.current);
    priceDebounceRef.current = setTimeout(() => {
      const currentMin = latestParamsRef.current.get("minPrice") ?? "";
      const currentMax = latestParamsRef.current.get("maxPrice") ?? "";
      if (minDraft.trim() !== currentMin || maxDraft.trim() !== currentMax) {
        updateParams({
          minPrice: minDraft.trim(),
          maxPrice: maxDraft.trim(),
        });
      }
    }, 450);

    return () => {
      if (priceDebounceRef.current) clearTimeout(priceDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minDraft, maxDraft]);

  function handleApplyPrice() {
    if (priceDebounceRef.current) clearTimeout(priceDebounceRef.current);
    updateParams({
      minPrice: minDraft.trim(),
      maxPrice: maxDraft.trim(),
    });
  }

  function handleResetAll() {
    setMinDraft("");
    setMaxDraft("");
    updateParams({
      q: "",
      category: "",
      stock: "",
      minPrice: "",
      maxPrice: "",
    });
  }

  const currentSortItem = SORT_OPTIONS.find((opt) => opt.value === sort) ?? SORT_OPTIONS[0];

  // Numeric bounds for dual range slider
  const parsedMin = Number(minDraft);
  const parsedMax = Number(maxDraft);
  const currentMin = !Number.isNaN(parsedMin) && minDraft !== ""
    ? Math.max(PRICE_MIN_BOUND, Math.min(parsedMin, PRICE_MAX_BOUND))
    : PRICE_MIN_BOUND;
  const currentMax = !Number.isNaN(parsedMax) && maxDraft !== ""
    ? Math.min(PRICE_MAX_BOUND, Math.max(parsedMax, PRICE_MIN_BOUND))
    : PRICE_MAX_BOUND;

  const minPercent = Math.min(100, Math.max(0, ((currentMin - PRICE_MIN_BOUND) / (PRICE_MAX_BOUND - PRICE_MIN_BOUND)) * 100));
  const maxPercent = Math.min(100, Math.max(0, ((currentMax - PRICE_MIN_BOUND) / (PRICE_MAX_BOUND - PRICE_MIN_BOUND)) * 100));

  const activeFilterChips = (
    <>
      {activeCategories.map((c) => (
        <span
          key={c.id}
          className="inline-flex shrink-0 items-center gap-1.5 border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium rounded-none"
        >
          <span>Category: {c.name}</span>
          <button
            type="button"
            onClick={() => handleSelectCategory(c.slug)}
            className="text-muted-foreground hover:text-foreground"
            aria-label={`Remove ${c.name} filter`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      {stock && (
        <span className="inline-flex shrink-0 items-center gap-1.5 border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium rounded-none">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-none",
              stock === "in-stock" ? "bg-emerald-500" : "bg-rose-500",
            )}
          />
          <span>{stock === "in-stock" ? "In Stock" : "Out of Stock"}</span>
          <button
            type="button"
            onClick={() => updateParams({ stock: "" })}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Remove stock filter"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      )}

      {(minPrice || maxPrice) && (
        <span className="inline-flex shrink-0 items-center gap-1.5 border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium rounded-none">
          <span>
            {minPrice && maxPrice
              ? `₦${Number(minPrice).toLocaleString()} – ₦${Number(maxPrice).toLocaleString()}`
              : minPrice
                ? `From ₦${Number(minPrice).toLocaleString()}`
                : `Up to ₦${Number(maxPrice).toLocaleString()}`}
          </span>
          <button
            type="button"
            onClick={() => {
              setMinDraft("");
              setMaxDraft("");
              updateParams({ minPrice: "", maxPrice: "" });
            }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Remove price filter"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      )}

      {q && (
        <span className="inline-flex shrink-0 items-center gap-1.5 border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium rounded-none">
          <span>Search: “{q}”</span>
          <button
            type="button"
            onClick={() => updateParams({ q: "" })}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Clear search query"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      )}

      {hasActiveFilters && (
        <button
          type="button"
          onClick={handleResetAll}
          className="text-xs shrink-0 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Clear all
        </button>
      )}
    </>
  );

  return (
    <>
      <div className="w-full max-w-full flex flex-col overflow-x-hidden">
        {/* Top Split Toolbar Bar spanning edge-to-edge */}
        <div className="flex w-full items-stretch justify-between min-h-[48px] sm:min-h-[64px]">
          {/* Left Section: FILTERS and CATEGORIES */}
          <div className="flex items-stretch shrink-0">
            {/* FILTERS button: Opens Left Slide-over Sidebar Drawer */}
            <button
              type="button"
              onClick={() => setIsFilterSidebarOpen(true)}
              className={cn(
                "flex items-center gap-1.5 sm:gap-2.5 border-r border-border px-3 py-3 sm:px-8 sm:py-4",
                "text-xs sm:text-sm font-semibold uppercase tracking-wider transition-colors rounded-none",
                isFilterSidebarOpen || (stock || minPrice || maxPrice)
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <Filter className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span>FILTERS</span>
              {(stock || minPrice || maxPrice) && (
                <span className="ml-1 sm:ml-1.5 flex h-4 min-w-4 items-center justify-center bg-foreground px-1 text-[10px] font-bold text-background rounded-none">
                  {(stock ? 1 : 0) + (minPrice || maxPrice ? 1 : 0)}
                </span>
              )}
            </button>

            {/* CATEGORIES button */}
            <button
              type="button"
              onClick={() => setIsCategoriesDrawerOpen((prev) => !prev)}
              className={cn(
                "flex items-center gap-1.5 sm:gap-2.5 border-r border-border px-3 py-3 sm:px-8 sm:py-4",
                "text-xs sm:text-sm font-semibold uppercase tracking-wider transition-colors rounded-none",
                isCategoriesDrawerOpen || selectedSlugs.length > 0
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <Layers className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span>CATEGORIES</span>
              {selectedSlugs.length > 0 && (
                <span className="ml-1 sm:ml-1.5 flex h-4 min-w-4 items-center justify-center bg-foreground px-1 text-[10px] font-bold text-background rounded-none">
                  {selectedSlugs.length}
                </span>
              )}
            </button>
          </div>

          {/* Middle: Active filter tags (desktop only) */}
          <div className="hidden lg:flex flex-1 min-w-0 items-center gap-2 overflow-x-auto px-4 sm:px-6 py-2">
            {activeFilterChips}
          </div>

          {/* Right: Custom UI-Adapted SORT Dropdown */}
          <div ref={sortDropdownRef} className="relative flex items-center border-l border-border shrink-0">
            <button
              type="button"
              onClick={() => setIsSortDropdownOpen((prev) => !prev)}
              aria-haspopup="listbox"
              aria-expanded={isSortDropdownOpen}
              className={cn(
                "flex items-center gap-1.5 sm:gap-2 px-3 py-3 sm:px-8 sm:py-4",
                "text-xs sm:text-sm font-semibold uppercase tracking-wider transition-colors rounded-none whitespace-nowrap",
                isSortDropdownOpen
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <span className="truncate max-w-[85px] sm:max-w-none">{currentSortItem.shortLabel}</span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 sm:h-4 sm:w-4 transition-transform duration-200",
                  isSortDropdownOpen && "rotate-180 text-foreground",
                )}
              />
            </button>

            {/* Custom Adapted Dropdown Menu with Sharp 90-degree corners */}
            {isSortDropdownOpen && (
              <div
                role="listbox"
                aria-label="Sort products by"
                className={cn(
                  "absolute right-0 top-full z-50 mt-[-1px] min-w-[220px] sm:min-w-[260px]",
                  "border border-border bg-background shadow-xl rounded-none",
                  "py-1 divide-y divide-border/40 animate-in fade-in zoom-in-95 duration-150",
                )}
              >
                <div className="px-4 py-2 border-b border-border/60 bg-muted/30">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Sort By
                  </span>
                </div>
                <div className="py-1">
                  {SORT_OPTIONS.map((opt) => {
                    const isSelected = opt.value === sort;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          updateParams({ sort: opt.value === "featured" ? "" : opt.value });
                          setIsSortDropdownOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between px-4 py-2.5 text-left text-xs uppercase tracking-wider transition-colors rounded-none",
                          isSelected
                            ? "bg-foreground text-background font-bold"
                            : "text-foreground/80 hover:bg-muted hover:text-foreground font-medium",
                        )}
                      >
                        <span>{opt.label}</span>
                        {isSelected && <Check className="h-3.5 w-3.5 stroke-[2.5]" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Mobile/Tablet active filters row — dedicated horizontal bar */}
        {hasActiveFilters && (
          <div className="flex lg:hidden w-full items-center gap-2 overflow-x-auto border-t border-border px-3 py-2 bg-muted/20">
            {activeFilterChips}
          </div>
        )}

        {/* Quick CATEGORIES Drawer (Horizontal) */}
        {isCategoriesDrawerOpen && (
          <div className="w-full border-t border-border bg-muted/20 px-6 py-6 sm:px-10 transition-all animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Browse Categories
                </span>
                {selectedSlugs.length > 0 && (
                  <button
                    type="button"
                    onClick={clearCategories}
                    className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  >
                    Show all products
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={clearCategories}
                  className={cn(
                    "border px-4 py-2 text-xs font-medium uppercase tracking-wider transition-colors rounded-none",
                    selectedSlugs.length === 0
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/50",
                  )}
                >
                  All Categories
                </button>
                {categories.map((c) => {
                  const isSelected = selectedSlugs.includes(c.slug);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectCategory(c.slug)}
                      className={cn(
                        "flex items-center gap-2 border px-4 py-2 text-xs font-medium uppercase tracking-wider transition-colors rounded-none",
                        isSelected
                          ? "border-foreground bg-foreground text-background shadow-sm"
                          : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/50",
                      )}
                    >
                      <span>{c.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          SLIDE-OVER FILTERS SIDEBAR (Matching User's Attached Reference Image)
          Contains ONLY Availability & Price accordions and sticky VIEW ITEMS button
         ========================================================================= */}
      {isFilterSidebarOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={() => setIsFilterSidebarOpen(false)}
            aria-hidden="true"
          />

          {/* Left slide-over panel */}
          <aside
            role="dialog"
            aria-label="Filters"
            aria-modal="true"
            className="relative z-50 flex h-full w-full max-w-[340px] sm:max-w-[380px] flex-col border-r border-border bg-background shadow-2xl transition-transform animate-in slide-in-from-left duration-300"
          >
            {/* Sidebar Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-5">
              <h2 className="text-xs sm:text-sm font-bold uppercase tracking-widest text-foreground">
                FILTERS
              </h2>
              <button
                type="button"
                onClick={() => setIsFilterSidebarOpen(false)}
                className="p-1 text-foreground transition-colors hover:opacity-70"
                aria-label="Close filters"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Filters Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6 divide-y divide-border/80">
              {/* 1. Availability Accordion */}
              <div className="pb-6">
                <button
                  type="button"
                  onClick={() => setAvailabilityOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between py-1 text-xs font-bold uppercase tracking-wider text-foreground hover:text-primary transition-colors"
                >
                  <span>Availability</span>
                  {availabilityOpen ? (
                    <ChevronUp className="h-4 w-4 text-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-foreground" />
                  )}
                </button>

                {availabilityOpen && (
                  <div className="mt-4 space-y-3 animate-in fade-in duration-150">
                    {/* In Stock Checkbox */}
                    <label
                      onClick={() =>
                        updateParams({
                          stock: stock === "in-stock" ? "" : "in-stock",
                        })
                      }
                      className="flex cursor-pointer items-center gap-3 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors select-none"
                    >
                      <div
                        className={cn(
                          "flex h-4 w-4 items-center justify-center border transition-colors rounded-none",
                          stock === "in-stock"
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-background",
                        )}
                      >
                        {stock === "in-stock" && <Check className="h-3 w-3 stroke-[3]" />}
                      </div>
                      <span>In Stock</span>
                    </label>

                    {/* Out Of Stock Checkbox */}
                    <label
                      onClick={() =>
                        updateParams({
                          stock: stock === "out-of-stock" ? "" : "out-of-stock",
                        })
                      }
                      className="flex cursor-pointer items-center gap-3 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors select-none"
                    >
                      <div
                        className={cn(
                          "flex h-4 w-4 items-center justify-center border transition-colors rounded-none",
                          stock === "out-of-stock"
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-background",
                        )}
                      >
                        {stock === "out-of-stock" && <Check className="h-3 w-3 stroke-[3]" />}
                      </div>
                      <span>Out Of Stock</span>
                    </label>
                  </div>
                )}
              </div>

              {/* 2. Price Accordion */}
              <div className="py-6">
                <button
                  type="button"
                  onClick={() => setPriceOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between py-1 text-xs font-bold uppercase tracking-wider text-foreground hover:text-primary transition-colors"
                >
                  <span>Price</span>
                  {priceOpen ? (
                    <ChevronUp className="h-4 w-4 text-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-foreground" />
                  )}
                </button>

                {priceOpen && (
                  <div className="mt-4 space-y-4 animate-in fade-in duration-150">
                    {/* Dual-thumb Interactive Range Slider */}
                    <div className="relative py-3">
                      {/* Base Track */}
                      <div className="relative h-1 w-full bg-border rounded-none">
                        {/* Active Filled Range Bar */}
                        <div
                          className="absolute h-1 bg-foreground rounded-none"
                          style={{
                            left: `${minPercent}%`,
                            width: `${Math.max(0, maxPercent - minPercent)}%`,
                          }}
                        />
                      </div>

                      {/* Overlaid Min Range Input */}
                      <input
                        type="range"
                        min={PRICE_MIN_BOUND}
                        max={PRICE_MAX_BOUND}
                        step={PRICE_STEP}
                        value={currentMin}
                        onChange={(e) => {
                          const val = Math.min(Number(e.target.value), currentMax);
                          setMinDraft(val <= PRICE_MIN_BOUND ? "" : String(val));
                        }}
                        className={cn(
                          "pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 w-full appearance-none bg-transparent",
                          "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none",
                          "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-foreground [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:cursor-pointer",
                          currentMin > PRICE_MAX_BOUND * 0.85 ? "z-20" : "z-10",
                        )}
                        aria-label="Minimum price slider"
                      />

                      {/* Overlaid Max Range Input */}
                      <input
                        type="range"
                        min={PRICE_MIN_BOUND}
                        max={PRICE_MAX_BOUND}
                        step={PRICE_STEP}
                        value={currentMax}
                        onChange={(e) => {
                          const val = Math.max(Number(e.target.value), currentMin);
                          setMaxDraft(val >= PRICE_MAX_BOUND ? "" : String(val));
                        }}
                        className={cn(
                          "pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 w-full appearance-none bg-transparent",
                          "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none",
                          "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-foreground [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:cursor-pointer",
                          "z-15",
                        )}
                        aria-label="Maximum price slider"
                      />
                    </div>

                    {/* Dual Amount Boxes matching user's reference image */}
                    <div className="flex items-center gap-2 pt-1">
                      {/* Min Box */}
                      <div className="relative flex-1 border border-border bg-background px-3 py-2 flex items-center justify-between rounded-none focus-within:border-foreground">
                        <span className="text-xs font-semibold text-foreground/80 select-none">₦</span>
                        <input
                          type="number"
                          min={PRICE_MIN_BOUND}
                          max={PRICE_MAX_BOUND}
                          step={PRICE_STEP}
                          value={minDraft}
                          onChange={(e) => setMinDraft(e.target.value)}
                          placeholder="0"
                          className="w-full bg-transparent pl-2 text-right text-xs font-mono text-foreground focus:outline-none"
                          aria-label="Minimum price"
                        />
                      </div>

                      <span className="text-muted-foreground text-xs font-semibold select-none">–</span>

                      {/* Max Box */}
                      <div className="relative flex-1 border border-border bg-background px-3 py-2 flex items-center justify-between rounded-none focus-within:border-foreground">
                        <span className="text-xs font-semibold text-foreground/80 select-none">₦</span>
                        <input
                          type="number"
                          min={PRICE_MIN_BOUND}
                          max={PRICE_MAX_BOUND}
                          step={PRICE_STEP}
                          value={maxDraft}
                          onChange={(e) => setMaxDraft(e.target.value)}
                          placeholder="1600000"
                          className="w-full bg-transparent pl-2 text-right text-xs font-mono text-foreground focus:outline-none"
                          aria-label="Maximum price"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sticky Sidebar Bottom Action matching user's image */}
            <div className="border-t border-border p-5 sm:p-6 bg-background space-y-2">
              <button
                type="button"
                onClick={() => {
                  handleApplyPrice();
                  setIsFilterSidebarOpen(false);
                }}
                className="w-full border border-foreground/80 bg-background py-3.5 text-center text-xs font-bold uppercase tracking-widest text-foreground transition-colors hover:bg-foreground hover:text-background rounded-none"
              >
                VIEW {totalCount} {totalCount === 1 ? "ITEM" : "ITEMS"}
              </button>

              {(stock || minPrice || maxPrice) && (
                <button
                  type="button"
                  onClick={() => {
                    setMinDraft("");
                    setMaxDraft("");
                    updateParams({
                      stock: "",
                      minPrice: "",
                      maxPrice: "",
                    });
                  }}
                  className="w-full py-1 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider underline underline-offset-4 hover:text-foreground transition-colors"
                >
                  Reset Filters
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
