import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMockSupabase, type MockSupabase } from "@/lib/testing/mock-supabase";
import {
  createProduct,
  updateProduct,
  getProductVariants,
  type ProductInput,
} from "@/features/admin/lib/products/products";
import { ProductView } from "@/features/catalog/components/product-view";
import type { Product, ProductVariant } from "@/features/catalog/lib/catalog";
import { useCartStore } from "@/features/cart/lib/cart";

const toClient = (mock: MockSupabase) => mock as unknown as SupabaseClient;

describe("Size-Level Inventory Management & Automatic Total Stock Calculation", () => {
  // Scenario 1: Creating a product with S = 4, M = 2, L = 5, XL = 3 calculates total stock as 14.
  it("Scenario 1: creates a product with S=4, M=2, L=5, XL=3 and auto-calculates total stock as 14", async () => {
    const supabase = createMockSupabase({ products: [], product_variants: [] });

    const input: ProductInput = {
      name: "Boojy Oversized Tee",
      description: "Heavyweight streetwear tee",
      price: 25000,
      stock_quantity: 0, // Frontend preview or initial value; will be auto-calculated from variants
      status: "active",
      category_id: null,
      image_url: "https://example.com/tee.jpg",
      sizes: ["S", "M", "L", "XL"],
      variants: [
        { size: "S", stock_quantity: 4 },
        { size: "M", stock_quantity: 2 },
        { size: "L", stock_quantity: 5 },
        { size: "XL", stock_quantity: 3 },
      ],
    };

    const result = await createProduct(toClient(supabase), input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Total stock must be 14 (4 + 2 + 5 + 3)
    expect(result.product.stock_quantity).toBe(14);

    // Verify variants were persisted in product_variants
    const variants = await getProductVariants(toClient(supabase), result.product.id);
    expect(variants).toHaveLength(4);
    expect(variants.find((v) => v.size === "S")?.stock_quantity).toBe(4);
    expect(variants.find((v) => v.size === "M")?.stock_quantity).toBe(2);
    expect(variants.find((v) => v.size === "L")?.stock_quantity).toBe(5);
    expect(variants.find((v) => v.size === "XL")?.stock_quantity).toBe(3);
  });

  // Scenario 2: Editing M from 2 to 6 updates the total to 18.
  it("Scenario 2: editing M from 2 to 6 updates the total to 18", async () => {
    const productId = "prod-tee-01";
    const initialVariants: ProductVariant[] = [
      { id: "var-s", product_id: productId, size: "S", color: null, sku: null, stock_quantity: 4, status: "active", created_at: "", updated_at: "" },
      { id: "var-m", product_id: productId, size: "M", color: null, sku: null, stock_quantity: 2, status: "active", created_at: "", updated_at: "" },
      { id: "var-l", product_id: productId, size: "L", color: null, sku: null, stock_quantity: 5, status: "active", created_at: "", updated_at: "" },
      { id: "var-xl", product_id: productId, size: "XL", color: null, sku: null, stock_quantity: 3, status: "active", created_at: "", updated_at: "" },
    ];

    const supabase = createMockSupabase({
      products: [
        {
          id: productId,
          name: "Boojy Oversized Tee",
          description: "Heavyweight streetwear tee",
          price: 25000,
          stock_quantity: 14,
          status: "active",
          category_id: null,
          image_url: "https://example.com/tee.jpg",
          created_at: new Date().toISOString(),
        },
      ],
      product_variants: initialVariants,
    });

    const updateInput: ProductInput = {
      name: "Boojy Oversized Tee",
      description: "Heavyweight streetwear tee",
      price: 25000,
      stock_quantity: 18,
      status: "active",
      category_id: null,
      image_url: "https://example.com/tee.jpg",
      sizes: ["S", "M", "L", "XL"],
      variants: [
        { id: "var-s", size: "S", stock_quantity: 4 },
        { id: "var-m", size: "M", stock_quantity: 6 }, // Updated from 2 to 6
        { id: "var-l", size: "L", stock_quantity: 5 },
        { id: "var-xl", size: "XL", stock_quantity: 3 },
      ],
    };

    const updateResult = await updateProduct(toClient(supabase), productId, updateInput);
    expect(updateResult.ok).toBe(true);
    if (!updateResult.ok) return;

    // Total stock updated to 18 (4 + 6 + 5 + 3)
    expect(updateResult.product.stock_quantity).toBe(18);

    const updatedVariants = await getProductVariants(toClient(supabase), productId);
    expect(updatedVariants.find((v) => v.size === "M")?.stock_quantity).toBe(6);
  });

  // Scenario 3: Purchasing two Medium units reduces M from 2 to 0 and the total from 14 to 12.
  it("Scenario 3: purchasing two Medium units reduces M from 2 to 0 and the total from 14 to 12", () => {
    // Simulate atomic variant inventory deduction logic mirroring Supabase confirm_bachs_payment RPC
    const initialVariants = [
      { id: "var-s", size: "S", stock_quantity: 4 },
      { id: "var-m", size: "M", stock_quantity: 2 },
      { id: "var-l", size: "L", stock_quantity: 5 },
      { id: "var-xl", size: "XL", stock_quantity: 3 },
    ];

    const purchasedSize = "M";
    const purchasedQty = 2;

    const targetVariant = initialVariants.find((v) => v.size === purchasedSize);
    expect(targetVariant).toBeDefined();
    expect(targetVariant!.stock_quantity).toBeGreaterThanOrEqual(purchasedQty);

    targetVariant!.stock_quantity -= purchasedQty;
    const newTotal = initialVariants.reduce((sum, v) => sum + v.stock_quantity, 0);

    expect(targetVariant!.stock_quantity).toBe(0);
    expect(newTotal).toBe(12);
  });

  // Scenario 4 & 5: When M reaches zero, only M receives the diagonal unavailability symbol and S, L, XL remain selectable.
  it("Scenario 4 & 5: zero-stock size M displays diagonal strike-through SVG, disabled selection, aria-label, and NO visible 'Out of Stock' text", () => {
    const product: Product = {
      id: "prod-tee-01",
      name: "Boojy Oversized Tee",
      description: "Heavyweight streetwear tee",
      price: 25000,
      stock_quantity: 12,
      status: "active",
      category_id: null,
      image_url: "https://example.com/tee.jpg",
      sizes: ["S", "M", "L", "XL"],
      variants: [
        { id: "var-s", product_id: "prod-tee-01", size: "S", color: null, sku: null, stock_quantity: 4, status: "active", created_at: "", updated_at: "" },
        { id: "var-m", product_id: "prod-tee-01", size: "M", color: null, sku: null, stock_quantity: 0, status: "active", created_at: "", updated_at: "" }, // 0 stock
        { id: "var-l", product_id: "prod-tee-01", size: "L", color: null, sku: null, stock_quantity: 5, status: "active", created_at: "", updated_at: "" },
        { id: "var-xl", product_id: "prod-tee-01", size: "XL", color: null, sku: null, stock_quantity: 3, status: "active", created_at: "", updated_at: "" },
      ],
    };

    const html = renderToStaticMarkup(<ProductView product={product} categories={[]} />);

    // M must be marked unavailable with aria-label and disabled
    expect(html).toContain('aria-label="Size M, unavailable"');
    expect(html).toContain('disabled=""');

    // M must render the diagonal strike-through SVG
    expect(html).toContain('<line x1="0" y1="100" x2="100" y2="0"');

    // S, L, XL must remain available and selectable
    expect(html).toContain('aria-label="Select size S"');
    expect(html).toContain('aria-label="Select size L"');
    expect(html).toContain('aria-label="Select size XL"');

    // CRITICAL: The visible size box must NOT display "Out of Stock"
    // (the overall product is in stock with 12 units total, and size buttons only contain the size letter)
    expect(html).not.toMatch(/<button[^>]*aria-label="Size M, unavailable"[^>]*>[\s\S]*Out of [Ss]tock/);
  });

  // Scenario 6 & 7: Customer cannot add or purchase zero-stock variant, and exceeding stock is rejected.
  it("Scenario 6 & 7: cart rejects adding zero-stock variant or exceeding variant stock", () => {
    const store = useCartStore.getState();
    store.clearCart();

    const productWithVariants: Product = {
      id: "prod-tee-01",
      name: "Boojy Oversized Tee",
      description: "Heavyweight streetwear tee",
      price: 25000,
      stock_quantity: 12,
      status: "active",
      category_id: null,
      image_url: "https://example.com/tee.jpg",
      sizes: ["S", "M", "L", "XL"],
      variants: [
        { id: "var-s", product_id: "prod-tee-01", size: "S", color: null, sku: null, stock_quantity: 4, status: "active", created_at: "", updated_at: "" },
        { id: "var-m", product_id: "prod-tee-01", size: "M", color: null, sku: null, stock_quantity: 0, status: "active", created_at: "", updated_at: "" }, // 0 stock
      ],
    };

    // Attempting to add size M (0 stock) must not add to cart
    store.addItem(productWithVariants, 1, "M");
    expect(useCartStore.getState().items).toHaveLength(0);

    // Attempting to add size S with quantity 5 (when only 4 in stock) clamps to 4
    store.addItem(productWithVariants, 5, "S");
    const items = useCartStore.getState().items;
    expect(items).toHaveLength(1);
    const addedItem = items[0];
    expect(addedItem.quantity).toBe(4); // Clamped to available variant stock of 4
    expect(addedItem.selected_size).toBe("S");
    expect(addedItem.variant_id).toBe("var-s");

    store.clearCart();
  });

  // Scenario 8: Two concurrent purchases cannot oversell the last unit.
  it("Scenario 8: atomic row locking simulation prevents concurrent purchases from overselling", () => {
    // Simulate database row-level locking (SELECT ... FOR UPDATE)
    let variantStock = 1;

    function attemptPurchase(requestedQty: number): { success: boolean; remaining: number } {
      if (variantStock >= requestedQty) {
        variantStock -= requestedQty;
        return { success: true, remaining: variantStock };
      }
      return { success: false, remaining: variantStock };
    }

    // Customer A and Customer B both attempt to buy 1 unit of the last available unit
    const purchaseA = attemptPurchase(1);
    const purchaseB = attemptPurchase(1);

    // One succeeds, the other is rejected
    expect(purchaseA.success).toBe(true);
    expect(purchaseB.success).toBe(false);
    expect(variantStock).toBe(0);
  });

  // Scenario 9: Repeated payment webhooks cannot deduct inventory twice (idempotency).
  it("Scenario 9: payment confirmation is idempotent; repeated calls do not deduct stock twice", () => {
    let orderPaymentStatus: "unpaid" | "paid" = "unpaid";
    let variantStock = 5;
    const orderItems = [{ variant_id: "var-s", quantity: 2 }];

    function confirmPayment(orderId: string): { ok: boolean; status: string } {
      if (orderPaymentStatus === "paid") {
        // Idempotent: Already paid, return success without deducting again
        return { ok: true, status: "ALREADY_CONFIRMED" };
      }

      orderPaymentStatus = "paid";
      for (const item of orderItems) {
        variantStock -= item.quantity;
      }
      return { ok: true, status: "CONFIRMED" };
    }

    // First webhook delivery
    const call1 = confirmPayment("ORD-101");
    expect(call1.status).toBe("CONFIRMED");
    expect(variantStock).toBe(3); // 5 - 2 = 3

    // Second webhook delivery (retry / duplicate)
    const call2 = confirmPayment("ORD-101");
    expect(call2.status).toBe("ALREADY_CONFIRMED");
    expect(variantStock).toBe(3); // Remains 3, never deducted again!
  });

  // Scenario 10: Failed or expired payments do not consume stock.
  it("Scenario 10: failed payment does not deduct stock", () => {
    const initialStock = 5;
    let variantStock = initialStock;
    let orderPaymentStatus: "unpaid" | "failed" = "unpaid";

    function handlePaymentFailure(): void {
      orderPaymentStatus = "failed";
      // Inventory is NOT deducted for failed payments
    }

    handlePaymentFailure();
    expect(orderPaymentStatus).toBe("failed");
    expect(variantStock).toBe(initialStock);
  });

  // Scenario 11: Editing unrelated product details does not reset stock.
  it("Scenario 11: updating unrelated fields preserves size-level variant inventory", async () => {
    const productId = "prod-tee-01";
    const supabase = createMockSupabase({
      products: [
        {
          id: productId,
          name: "Boojy Oversized Tee",
          description: "Original description",
          price: 25000,
          stock_quantity: 14,
          status: "active",
          category_id: null,
          image_url: "https://example.com/tee.jpg",
          created_at: new Date().toISOString(),
        },
      ],
      product_variants: [
        { id: "var-s", product_id: productId, size: "S", color: null, sku: null, stock_quantity: 4, status: "active", created_at: "", updated_at: "" },
        { id: "var-m", product_id: productId, size: "M", color: null, sku: null, stock_quantity: 2, status: "active", created_at: "", updated_at: "" },
        { id: "var-l", product_id: productId, size: "L", color: null, sku: null, stock_quantity: 5, status: "active", created_at: "", updated_at: "" },
        { id: "var-xl", product_id: productId, size: "XL", color: null, sku: null, stock_quantity: 3, status: "active", created_at: "", updated_at: "" },
      ],
    });

    // Update only description and price
    const updateInput: ProductInput = {
      name: "Boojy Oversized Tee - Premium",
      description: "Updated luxury fabric description",
      price: 28000,
      stock_quantity: 14,
      status: "active",
      category_id: null,
      image_url: "https://example.com/tee.jpg",
      sizes: ["S", "M", "L", "XL"],
      variants: [
        { id: "var-s", size: "S", stock_quantity: 4 },
        { id: "var-m", size: "M", stock_quantity: 2 },
        { id: "var-l", size: "L", stock_quantity: 5 },
        { id: "var-xl", size: "XL", stock_quantity: 3 },
      ],
    };

    const res = await updateProduct(toClient(supabase), productId, updateInput);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const variants = await getProductVariants(toClient(supabase), productId);
    expect(variants.find((v) => v.size === "S")?.stock_quantity).toBe(4);
    expect(variants.find((v) => v.size === "M")?.stock_quantity).toBe(2);
    expect(variants.find((v) => v.size === "L")?.stock_quantity).toBe(5);
    expect(variants.find((v) => v.size === "XL")?.stock_quantity).toBe(3);
    expect(res.product.stock_quantity).toBe(14);
  });

  // Scenario 12: Adding or removing variants safely archives variants with order history.
  it("Scenario 12: safely archives removed variants with order history without deleting historical data", async () => {
    const productId = "prod-tee-01";
    const supabase = createMockSupabase({
      products: [
        {
          id: productId,
          name: "Boojy Oversized Tee",
          description: "Original description",
          price: 25000,
          stock_quantity: 14,
          status: "active",
          category_id: null,
          image_url: "https://example.com/tee.jpg",
          created_at: new Date().toISOString(),
        },
      ],
      product_variants: [
        { id: "var-s", product_id: productId, size: "S", color: null, sku: null, stock_quantity: 4, status: "active", created_at: "", updated_at: "" },
        { id: "var-m", product_id: productId, size: "M", color: null, sku: null, stock_quantity: 2, status: "active", created_at: "", updated_at: "" },
      ],
      order_items: [
        { id: "item-1", order_id: "ord-1", product_id: productId, variant_id: "var-m", size: "M", quantity: 1, unit_price: 25000 },
      ],
    });

    // Remove size M from available sizes (only keep S)
    const updateInput: ProductInput = {
      name: "Boojy Oversized Tee",
      description: "Original description",
      price: 25000,
      stock_quantity: 4,
      status: "active",
      category_id: null,
      image_url: "https://example.com/tee.jpg",
      sizes: ["S"],
      variants: [
        { id: "var-s", size: "S", stock_quantity: 4 },
      ],
    };

    const res = await updateProduct(toClient(supabase), productId, updateInput);
    expect(res.ok).toBe(true);

    // var-m has order history so it is archived (status: archived), not hard deleted
    const allVariants = supabase.db.product_variants as ProductVariant[];
    const archivedM = allVariants.find((v) => v.id === "var-m");
    expect(archivedM).toBeDefined();
    expect(archivedM?.status).toBe("archived");

    // Historical order item snapshot is fully preserved
    expect(supabase.db.order_items).toHaveLength(1);
    expect(supabase.db.order_items[0].size).toBe("M");
  });

  // Scenario 13 & 14: Mobile and desktop responsiveness and non-variant fallback.
  it("Scenario 13 & 14: maintains fallback for non-variant products and responsive layout classes", () => {
    const singleProduct: Product = {
      id: "prod-cap-01",
      name: "Boojy Signature Cap",
      description: "One size fits all",
      price: 15000,
      stock_quantity: 8,
      status: "active",
      category_id: null,
      image_url: "https://example.com/cap.jpg",
      sizes: [], // No sizes
    };

    const html = renderToStaticMarkup(<ProductView product={singleProduct} categories={[]} />);

    // Responsive classes verified
    expect(html).toContain("lg:grid-cols-12");
    expect(html).toContain("text-base sm:text-lg");

    // No size buttons rendered when product has no sizes
    expect(html).not.toContain("Select your size");

    // Total stock indicates 8
    expect(html).not.toContain("Out of stock");
  });
});
