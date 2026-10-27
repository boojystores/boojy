"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  ImagePlus,
  Loader2,
  Plus,
  Star,
  UploadCloud,
  X,
} from "lucide-react";
import {
  cleanProductDescription,
  extractProductCategories,
  extractProductImages,
  extractProductSizes,
  STANDARD_CLOTHING_SIZES,
  type Category,
  type ProductStatus,
} from "@/features/catalog/lib/catalog";
import { validateImageFile } from "@/features/admin/lib/products/products";
import {
  createProductAction,
  updateProductAction,
} from "@/features/admin/actions/products";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { AdminProduct } from "@/features/admin/components/products-manager";

export type SizeVariantItem = {
  id?: string;
  size: string;
  color?: string;
  stock_quantity: number | "";
};

type FormState = {
  name: string;
  category_ids: string[];
  sizes: string[];
  price: string;
  stock_quantity: string;
  status: ProductStatus;
  description: string;
};

type PhotoItem =
  | { id: string; type: "existing"; url: string }
  | { id: string; type: "new"; file: File; previewUrl: string };

export function ProductFormModal({
  mode,
  product,
  hasOrders = false,
  categories,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  product: AdminProduct | null;
  hasOrders?: boolean;
  categories: Category[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const initialCategoryIds = product
    ? (product.category_ids && product.category_ids.length > 0
        ? product.category_ids
        : extractProductCategories(product))
    : [];

  const initialSizes = product
    ? (product.sizes && product.sizes.length > 0
        ? product.sizes
        : extractProductSizes(product))
    : [];

  const initialVariants: SizeVariantItem[] =
    product?.variants && product.variants.length > 0
      ? product.variants.map((v) => ({
          id: v.id,
          size: v.size,
          color: v.color || "",
          stock_quantity: v.stock_quantity,
        }))
      : initialSizes.map((s) => ({
          size: s,
          color: "",
          stock_quantity: initialSizes.length === 1 ? (product?.stock_quantity ?? 0) : 0,
        }));

  const initialImages = product ? extractProductImages(product) : [];

  const [form, setForm] = useState<FormState>(() => ({
    name: product?.name ?? "",
    category_ids: initialCategoryIds,
    sizes: initialSizes,
    price: product ? String(product.price) : "",
    stock_quantity: product ? String(product.stock_quantity) : "",
    status: product?.status ?? "active",
    description: product?.description ? cleanProductDescription(product.description) : "",
  }));

  const [sizeVariants, setSizeVariants] = useState<SizeVariantItem[]>(initialVariants);

  const [photos, setPhotos] = useState<PhotoItem[]>(() =>
    initialImages.map((url, i) => ({
      id: `existing-${i}-${url}`,
      type: "existing",
      url,
    })),
  );

  const [customSizeInput, setCustomSizeInput] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [draggedPhotoIndex, setDraggedPhotoIndex] = useState<number | null>(null);
  const [dragOverPhotoIndex, setDragOverPhotoIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);
  const createdBlobUrls = useRef<Set<string>>(new Set());

  // Reopen existing product and ensure actual persisted quantities come directly from Supabase
  useEffect(() => {
    if (mode === "edit" && product?.id) {
      const supabase = createClient();
      supabase
        .from("product_variants")
        .select("id, product_id, size, color, sku, stock_quantity, status")
        .eq("product_id", product.id)
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .then(({ data }) => {
          if (data && data.length > 0) {
            setSizeVariants(
              data.map((v) => ({
                id: v.id,
                size: v.size,
                color: v.color || "",
                stock_quantity: v.stock_quantity,
              })),
            );
            setForm((prev) => ({
              ...prev,
              sizes: data.map((v) => v.size),
            }));
          }
        });
    }
  }, [mode, product?.id]);

  // Derived: total stock automatically calculated from size variants
  const calculatedTotalStock = sizeVariants.reduce((sum, v) => {
    const q = typeof v.stock_quantity === "number" ? v.stock_quantity : 0;
    return sum + q;
  }, 0);

  // Dirty check: compare current form state with initial values
  const categoriesChanged =
    JSON.stringify([...form.category_ids].sort()) !==
    JSON.stringify([...initialCategoryIds].sort());

  const sizesChanged =
    JSON.stringify([...form.sizes].sort()) !==
    JSON.stringify([...initialSizes].sort());

  const variantsChanged =
    JSON.stringify(
      sizeVariants.map((v) => ({ size: v.size, qty: v.stock_quantity })),
    ) !==
    JSON.stringify(
      initialVariants.map((v) => ({ size: v.size, qty: v.stock_quantity })),
    );

  const photosChanged =
    mode === "create"
      ? photos.length > 0
      : photos.length !== initialImages.length ||
        photos.some((p) => p.type === "new") ||
        photos.some((p, idx) => p.type === "existing" && p.url !== initialImages[idx]);

  const isDirty =
    mode === "create" ||
    form.name !== (product?.name ?? "") ||
    categoriesChanged ||
    sizesChanged ||
    variantsChanged ||
    form.price !== (product ? String(product.price) : "") ||
    form.stock_quantity !== (product ? String(product.stock_quantity) : "") ||
    form.status !== (product?.status ?? "active") ||
    form.description !== (product?.description ? cleanProductDescription(product.description) : "") ||
    photosChanged;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Revoke all created blob URLs on unmount to avoid memory leaks
  useEffect(() => {
    const blobs = createdBlobUrls.current;
    return () => {
      blobs.forEach((url) => URL.revokeObjectURL(url));
      blobs.clear();
    };
  }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleCategory(categoryId: string) {
    setForm((prev) => {
      const exists = prev.category_ids.includes(categoryId);
      const next = exists
        ? prev.category_ids.filter((id) => id !== categoryId)
        : [...prev.category_ids, categoryId];
      return { ...prev, category_ids: next };
    });
  }

  function toggleSize(size: string) {
    const exists = sizeVariants.some((v) => v.size.toLowerCase() === size.toLowerCase());
    if (exists) {
      setSizeVariants((prev) => prev.filter((v) => v.size.toLowerCase() !== size.toLowerCase()));
      setForm((prev) => ({
        ...prev,
        sizes: prev.sizes.filter((s) => s.toLowerCase() !== size.toLowerCase()),
      }));
    } else {
      setSizeVariants((prev) => [...prev, { size, color: "", stock_quantity: 0 }]);
      setForm((prev) => ({
        ...prev,
        sizes: [...prev.sizes, size],
      }));
    }
  }

  function handleAddCustomSize() {
    const trimmed = customSizeInput.trim().toUpperCase();
    if (!trimmed) return;
    const exists = sizeVariants.some((v) => v.size.toLowerCase() === trimmed.toLowerCase());
    if (!exists) {
      setSizeVariants((prev) => [...prev, { size: trimmed, color: "", stock_quantity: 0 }]);
      setForm((prev) => ({
        ...prev,
        sizes: [...prev.sizes, trimmed],
      }));
    }
    setCustomSizeInput("");
  }

  function handleRemoveSize(size: string) {
    setSizeVariants((prev) => prev.filter((v) => v.size.toLowerCase() !== size.toLowerCase()));
    setForm((prev) => ({
      ...prev,
      sizes: prev.sizes.filter((s) => s.toLowerCase() !== size.toLowerCase()),
    }));
  }

  function handleUpdateSizeQuantity(size: string, qtyStr: string) {
    const val = qtyStr === "" ? "" : Math.max(0, parseInt(qtyStr, 10) || 0);
    setSizeVariants((prev) =>
      prev.map((v) => (v.size.toLowerCase() === size.toLowerCase() ? { ...v, stock_quantity: val } : v)),
    );
  }

  function handleUpdateSizeColor(size: string, colorStr: string) {
    setSizeVariants((prev) =>
      prev.map((v) => (v.size.toLowerCase() === size.toLowerCase() ? { ...v, color: colorStr } : v)),
    );
  }

  function handleFilesSelected(fileList: FileList | File[] | null) {
    if (!fileList || fileList.length === 0) return;
    const selected = Array.from(fileList);
    setFileError(null);

    // Validate all files
    const validItems: PhotoItem[] = [];
    for (const f of selected) {
      const invalid = validateImageFile(f);
      if (invalid) {
        setFileError(`${f.name}: ${invalid}`);
        return;
      }
      const previewUrl = URL.createObjectURL(f);
      createdBlobUrls.current.add(previewUrl);
      validItems.push({
        id: `new-${crypto.randomUUID()}`,
        type: "new",
        file: f,
        previewUrl,
      });
    }

    setPhotos((prev) => [...prev, ...validItems]);
  }

  function handleRemovePhoto(index: number) {
    setPhotos((prev) => {
      const target = prev[index];
      if (target?.type === "new") {
        URL.revokeObjectURL(target.previewUrl);
        createdBlobUrls.current.delete(target.previewUrl);
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  function handleMakeCover(index: number) {
    if (index === 0) return;
    setPhotos((prev) => {
      const target = prev[index];
      if (!target) return prev;
      const without = prev.filter((_, i) => i !== index);
      return [target, ...without];
    });
  }

  function handleMovePhoto(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= photos.length || fromIndex === toIndex) return;
    setPhotos((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function handleMoveLeft(index: number) {
    handleMovePhoto(index, index - 1);
  }

  function handleMoveRight(index: number) {
    handleMovePhoto(index, index + 1);
  }

  function handlePhotoDragStart(e: React.DragEvent, index: number) {
    e.dataTransfer.setData("text/plain", String(index));
    e.dataTransfer.effectAllowed = "move";
    setDraggedPhotoIndex(index);
  }

  function handlePhotoDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverPhotoIndex !== index) {
      setDragOverPhotoIndex(index);
    }
  }

  function handlePhotoDrop(e: React.DragEvent, targetIndex: number) {
    e.preventDefault();
    const sourceIndexRaw = e.dataTransfer.getData("text/plain");
    const sourceIndex = sourceIndexRaw !== "" ? Number(sourceIndexRaw) : draggedPhotoIndex;
    if (sourceIndex !== null && !isNaN(sourceIndex) && sourceIndex !== targetIndex) {
      handleMovePhoto(sourceIndex, targetIndex);
    }
    setDraggedPhotoIndex(null);
    setDragOverPhotoIndex(null);
  }

  function handlePhotoDragEnd() {
    setDraggedPhotoIndex(null);
    setDragOverPhotoIndex(null);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || inFlightRef.current) return;

    // Client-side pass (the server re-validates everything).
    if (!form.name.trim()) {
      setFormError("Product name is required.");
      return;
    }
    if (!form.price || Number(form.price) < 0) {
      setFormError("Enter a valid price.");
      return;
    }
    if (sizeVariants.length > 0) {
      for (const v of sizeVariants) {
        if (
          v.stock_quantity === "" ||
          !Number.isInteger(Number(v.stock_quantity)) ||
          Number(v.stock_quantity) < 0
        ) {
          setFormError(`Stock for size ${v.size} must be a valid non-negative whole number.`);
          return;
        }
      }
    } else {
      if (
        form.stock_quantity === "" ||
        !Number.isInteger(Number(form.stock_quantity)) ||
        Number(form.stock_quantity) < 0
      ) {
        setFormError("Enter a valid stock quantity.");
        return;
      }
    }

    if (photos.length === 0) {
      setFileError("At least one product photo is required.");
      return;
    }

    const formData = new FormData();
    formData.set("name", form.name.trim());
    formData.set("description", form.description.trim());
    formData.set("price", String(Number(form.price)));
    formData.set("status", form.status);
    formData.set("category_ids", form.category_ids.join(","));
    formData.set("category_id", form.category_ids[0] ?? "");

    if (sizeVariants.length > 0) {
      formData.set("stock_quantity", String(calculatedTotalStock));
      formData.set("sizes", sizeVariants.map((v) => v.size).join(","));
      formData.set(
        "variants",
        JSON.stringify(
          sizeVariants.map((v) => ({
            id: v.id,
            size: v.size,
            color: v.color || null,
            stock_quantity: Number(v.stock_quantity) || 0,
          })),
        ),
      );
    } else {
      formData.set("stock_quantity", String(Number(form.stock_quantity)));
      formData.set("sizes", "");
    }

    if (mode === "edit" && product) {
      formData.set("id", product.id);
    }

    // Append all photos in order and serialize the exact image sequence
    let newIndex = 0;
    const orderTokens: string[] = [];
    for (const p of photos) {
      if (p.type === "existing") {
        formData.append("existing_images", p.url);
        orderTokens.push(`existing:${p.url}`);
      } else {
        formData.append("new_images", p.file);
        orderTokens.push(`new:${newIndex}`);
        newIndex++;
        if (!formData.has("image")) {
          formData.set("image", p.file);
        }
      }
    }
    formData.set("image_order", JSON.stringify(orderTokens));

    inFlightRef.current = true;
    setSubmitting(true);
    setFormError(null);
    try {
      const result =
        mode === "create"
          ? await createProductAction(formData)
          : await updateProductAction(formData);
      if (result.ok) {
        onSaved(
          mode === "create"
            ? `"${result.product.name}" created with ${photos.length} photo${photos.length > 1 ? "s" : ""}`
            : `"${result.product.name}" saved with Cloudinary photos updated`,
        );
        onClose();
      } else {
        setFormError(result.message);
      }
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-black/50 backdrop-blur-sm"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-form-title"
        tabIndex={-1}
        className="relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden border border-border bg-background shadow-2xl outline-none"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="product-form-title" className="text-lg font-bold tracking-tight">
              {mode === "create" ? "New Product" : `Edit Product — ${product?.name}`}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Upload photos to Cloudinary and customize details
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {/* Notice for ordered products (informational only; photo uploads remain unlocked) */}
            {hasOrders && (
              <div className="flex items-start gap-2 border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  This product has previous order history. Photos and details can be freely updated here; prior orders safely keep their historical receipt snapshots.
                </p>
              </div>
            )}

            {/* Product Photos Section (Multi-Image Cloudinary Upload) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <UploadCloud className="h-4 w-4 text-foreground" />
                  Product Photos
                </Label>
                <span className="text-xs font-mono text-muted-foreground">
                  {photos.length === 0
                    ? "No photos added"
                    : `${photos.length} photo${photos.length > 1 ? "s" : ""} (1st is cover)`}
                </span>
              </div>

              {photos.length > 1 && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 bg-muted/40 px-2.5 py-1.5 border border-border/60">
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span>
                    Drag photos or click <strong className="text-foreground">◀ ▶</strong> arrows to reorder. The 1st photo is always the storefront cover.
                  </span>
                </p>
              )}

              {/* Photos Gallery / Thumbnails Strip */}
              {photos.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 border border-border p-3 bg-muted/20">
                  {photos.map((photo, index) => {
                    const src = photo.type === "existing" ? photo.url : photo.previewUrl;
                    const isCover = index === 0;
                    const isDraggingThis = draggedPhotoIndex === index;
                    const isDragOverThis = dragOverPhotoIndex === index && !isDraggingThis;

                    return (
                      <div
                        key={photo.id}
                        draggable
                        onDragStart={(e) => handlePhotoDragStart(e, index)}
                        onDragOver={(e) => handlePhotoDragOver(e, index)}
                        onDrop={(e) => handlePhotoDrop(e, index)}
                        onDragEnd={handlePhotoDragEnd}
                        className={cn(
                          "group relative aspect-square overflow-hidden border bg-background flex flex-col justify-between cursor-grab active:cursor-grabbing transition-all select-none shadow-xs",
                          isCover ? "border-foreground ring-2 ring-foreground" : "border-border hover:border-foreground/60",
                          isDraggingThis && "opacity-30 scale-95",
                          isDragOverThis && "ring-2 ring-primary border-primary scale-[1.03]",
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={src}
                          alt={`Product photo ${index + 1}`}
                          className="absolute inset-0 h-full w-full object-cover pointer-events-none"
                        />

                        {/* Top Header Actions (Cover Badge / Make Cover & Remove) */}
                        <div className="relative z-10 flex items-center justify-between p-1.5 bg-gradient-to-b from-black/60 to-transparent">
                          {isCover ? (
                            <div className="bg-black/90 dark:bg-white text-white dark:text-black text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 flex items-center gap-1 shadow-sm">
                              <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                              Cover (#1)
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMakeCover(index);
                              }}
                              title="Make this photo #1 Cover"
                              className="bg-background/90 hover:bg-background border border-border text-[9px] font-semibold uppercase px-1.5 py-0.5 text-foreground transition-opacity flex items-center gap-1 shadow-xs"
                            >
                              <Star className="h-2.5 w-2.5" />
                              Cover
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemovePhoto(index);
                            }}
                            aria-label={`Remove photo ${index + 1}`}
                            title="Remove photo"
                            className="bg-background/90 hover:bg-destructive hover:text-white border border-border h-5 w-5 flex items-center justify-center text-foreground transition-all shadow-xs"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>

                        {/* Bottom Reordering Bar: Move Left / Position Index / Move Right */}
                        <div className="relative z-10 flex items-center justify-between border-t border-border/80 bg-background/95 backdrop-blur-xs px-1.5 py-1 text-foreground shadow-xs">
                          {/* Move Left / Earlier */}
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveLeft(index);
                            }}
                            title={index === 0 ? "First in order" : `Move earlier to #${index}`}
                            aria-label={`Move photo ${index + 1} earlier`}
                            className={cn(
                              "h-6 w-6 flex items-center justify-center border transition-colors",
                              index === 0
                                ? "opacity-20 border-transparent cursor-not-allowed text-muted-foreground"
                                : "border-border bg-background hover:bg-muted active:scale-95 text-foreground cursor-pointer"
                            )}
                          >
                            <ChevronLeft className="h-3.5 w-3.5" />
                          </button>

                          {/* Position Badge & Drag Handle */}
                          <div
                            title="Drag to rearrange"
                            className="flex items-center gap-1 font-mono text-[10px] font-bold text-foreground cursor-grab"
                          >
                            <GripVertical className="h-3 w-3 text-muted-foreground" />
                            <span>#{index + 1}</span>
                          </div>

                          {/* Move Right / Later */}
                          <button
                            type="button"
                            disabled={index === photos.length - 1}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveRight(index);
                            }}
                            title={index === photos.length - 1 ? "Last in order" : `Move later to #${index + 2}`}
                            aria-label={`Move photo ${index + 1} later`}
                            className={cn(
                              "h-6 w-6 flex items-center justify-center border transition-colors",
                              index === photos.length - 1
                                ? "opacity-20 border-transparent cursor-not-allowed text-muted-foreground"
                                : "border-border bg-background hover:bg-muted active:scale-95 text-foreground cursor-pointer"
                            )}
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Upload Dropzone & Controls */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "flex flex-col items-center justify-center border-2 border-dashed p-4 text-center transition-colors cursor-pointer",
                  dragging
                    ? "border-foreground bg-foreground/5"
                    : "border-border hover:border-foreground/40 bg-muted/10",
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <ImagePlus className="h-5 w-5 text-muted-foreground" />
                  <span>
                    {dragging
                      ? "Drop pictures here to upload…"
                      : photos.length === 0
                        ? "Choose product photos…"
                        : "Change or add more photos…"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Select any amount of pictures · JPG, PNG, or WebP up to 5 MB each · Automatically saved to Cloudinary
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    handleFilesSelected(e.target.files);
                    e.target.value = ""; // Reset input so same files can be re-selected if desired
                  }}
                  className="sr-only"
                />
              </div>

              {fileError && (
                <p role="alert" className="text-xs font-medium text-destructive">
                  {fileError}
                </p>
              )}
            </div>

            {/* Product Name */}
            <Field label="Name" htmlFor="product-name">
              <Input
                id="product-name"
                value={form.name}
                onChange={(event) => set("name", event.target.value)}
                placeholder="Gan 356 M"
              />
            </Field>

            {/* Price & Stock */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Price (NGN ₦)" htmlFor="product-price">
                <Input
                  id="product-price"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={form.price}
                  onChange={(event) => set("price", event.target.value)}
                  placeholder="12.99"
                />
              </Field>

              {sizeVariants.length > 0 ? (
                <div>
                  <Label htmlFor="calculated-total-stock">Total Stock</Label>
                  <div className="mt-1.5 flex h-9 items-center justify-between border border-border bg-muted/20 px-3 text-sm">
                    <div className="flex items-center gap-1.5 font-mono font-bold text-foreground">
                      <span>{calculatedTotalStock}</span>
                      <span className="text-[11px] font-sans font-normal text-muted-foreground uppercase">
                        units
                      </span>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      (Auto-calculated from sizes)
                    </span>
                  </div>
                </div>
              ) : (
                <Field label="Stock quantity (No sizes)" htmlFor="product-stock">
                  <Input
                    id="product-stock"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={form.stock_quantity}
                    onChange={(event) => set("stock_quantity", event.target.value)}
                    placeholder="50"
                  />
                </Field>
              )}
            </div>

            {/* Categories Multi-Select */}
            <div>
              <div className="flex items-center justify-between">
                <Label>Categories</Label>
                <span className="text-xs text-muted-foreground">
                  {form.category_ids.length === 0
                    ? "Select one or more"
                    : `${form.category_ids.length} selected`}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose the categories this product belongs to. It will appear under each selected category on the storefront.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {categories.map((category) => {
                  const isSelected = form.category_ids.includes(category.id);
                  return (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => toggleCategory(category.id)}
                      className={cn(
                        "flex items-center gap-2 border px-3 py-2 text-xs font-medium uppercase tracking-wider transition-colors",
                        isSelected
                          ? "border-foreground bg-foreground text-background shadow-sm"
                          : "border-border bg-background text-muted-foreground hover:border-foreground/50 hover:text-foreground",
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-3.5 w-3.5 items-center justify-center border",
                          isSelected
                            ? "border-background bg-background text-foreground"
                            : "border-muted-foreground/40",
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                      <span>{category.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Available Sizes & Size-Level Inventory Management */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Available Sizes & Inventory</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Select the available sizes and enter the stock count for each. Total stock is calculated automatically.
                  </p>
                </div>
                <span className="text-xs font-semibold text-muted-foreground">
                  {sizeVariants.length === 0
                    ? "Single-piece (no size breakdown)"
                    : `${sizeVariants.length} size${sizeVariants.length > 1 ? "s" : ""} configured`}
                </span>
              </div>

              {/* Standard Size Quick Toggle Buttons */}
              <div className="flex flex-wrap gap-2">
                {STANDARD_CLOTHING_SIZES.map((size) => {
                  const isSelected = sizeVariants.some(
                    (v) => v.size.toLowerCase() === size.toLowerCase(),
                  );
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => toggleSize(size)}
                      className={cn(
                        "flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all",
                        isSelected
                          ? "border-foreground bg-foreground text-background shadow-xs font-bold"
                          : "border-border bg-background text-muted-foreground hover:border-foreground/50 hover:text-foreground",
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-3 w-3 items-center justify-center border",
                          isSelected
                            ? "border-background bg-background text-foreground"
                            : "border-muted-foreground/40",
                        )}
                      >
                        {isSelected && <Check className="h-2.5 w-2.5 stroke-[2.5]" />}
                      </div>
                      <span>{size}</span>
                    </button>
                  );
                })}
              </div>

              {/* Custom Size Adder */}
              <div className="flex items-center gap-2">
                <Input
                  value={customSizeInput}
                  onChange={(e) => setCustomSizeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCustomSize();
                    }
                  }}
                  placeholder="Add custom size (e.g. UK 10, 32x30, 42)..."
                  className="h-8 max-w-xs text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddCustomSize}
                  disabled={!customSizeInput.trim()}
                  className="h-8 px-2.5 text-xs font-medium"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add Size
                </Button>
              </div>

              {/* Size-Level Inventory Quantity Inputs & Live Total Calculation */}
              {sizeVariants.length > 0 && (
                <div className="mt-2 border border-border divide-y divide-border bg-background">
                  <div className="flex items-center justify-between bg-muted/40 px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <span className="w-24">Size</span>
                    <span className="w-28 text-center">Stock Count</span>
                    <span className="w-24 text-center">Status</span>
                    <span className="w-12 text-right">Action</span>
                  </div>

                  <div className="divide-y divide-border/60 max-h-60 overflow-y-auto">
                    {sizeVariants.map((item) => {
                      const qty = typeof item.stock_quantity === "number" ? item.stock_quantity : 0;
                      const isZero = qty === 0;

                      return (
                        <div
                          key={item.size}
                          className="flex items-center justify-between px-3.5 py-2 hover:bg-muted/10 transition-colors"
                        >
                          <div className="w-24 flex items-center gap-2">
                            <span className="inline-flex items-center justify-center border border-border bg-muted/20 px-2 py-0.5 font-mono text-xs font-bold text-foreground">
                              {item.size}
                            </span>
                          </div>

                          <div className="w-28 flex justify-center">
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              value={item.stock_quantity}
                              onChange={(e) => handleUpdateSizeQuantity(item.size, e.target.value)}
                              className="h-8 w-24 text-center font-mono text-xs font-bold"
                              placeholder="0"
                            />
                          </div>

                          <div className="w-24 flex justify-center">
                            <span
                              className={cn(
                                "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-none border",
                                !isZero
                                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
                              )}
                            >
                              {!isZero ? `${qty} in stock` : "0 stock"}
                            </span>
                          </div>

                          <div className="w-12 flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleRemoveSize(item.size)}
                              title={`Remove ${item.size}`}
                              className="text-muted-foreground hover:text-destructive transition-colors p-1"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Calculated Total Stock Bar */}
                  <div className="flex items-center justify-between bg-muted/30 px-3.5 py-2.5 border-t border-border">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                        Total stock:
                      </span>
                      <span className="font-mono text-sm font-bold text-foreground">
                        {calculatedTotalStock}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        (automatically calculated)
                      </span>
                    </div>

                    <span
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5",
                        calculatedTotalStock > 0
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-destructive/10 text-destructive",
                      )}
                    >
                      {calculatedTotalStock > 0 ? "In Stock" : "Zero Stock"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Visibility Status */}
            <Field label="Status" htmlFor="product-status">
              <select
                id="product-status"
                value={form.status}
                onChange={(event) => set("status", event.target.value as ProductStatus)}
                className="h-9 w-full border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="active">Active (visible on storefront)</option>
                <option value="inactive">Inactive (hidden)</option>
              </select>
            </Field>

            {/* Description */}
            <Field label="Description" htmlFor="product-description">
              <textarea
                id="product-description"
                rows={3}
                value={form.description}
                onChange={(event) => set("description", event.target.value)}
                placeholder="What makes it worth the click?"
                className="flex w-full border border-input bg-transparent px-3 py-2 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
              />
            </Field>

            {formError && (
              <div
                role="alert"
                className="border border-destructive/40 bg-destructive/5 p-3 text-sm font-medium text-destructive"
              >
                {formError}
              </div>
            )}
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-between border-t border-border px-5 py-4 bg-muted/10">
            <div className="text-xs text-muted-foreground">
              {photos.length > 0 && `${photos.length} image${photos.length > 1 ? "s" : ""} queued`}
            </div>
            <div className="flex items-center gap-3">
              <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !isDirty}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting
                  ? "Saving to Cloudinary…"
                  : mode === "create"
                    ? "Create Product"
                    : "Save Changes"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <Label htmlFor={htmlFor}>{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

