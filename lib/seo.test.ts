import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getSiteUrl,
  absoluteUrl,
  buildPageMetadata,
  getStoreJsonLd,
  getWebSiteJsonLd,
  getProductJsonLd,
  getBreadcrumbJsonLd,
} from "./seo";

describe("SEO Utilities & Metadata Builders", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("resolves canonical site URL from NEXT_PUBLIC_SITE_URL without trailing slashes", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://boojy.vercel.app/";
    expect(getSiteUrl()).toBe("https://boojy.vercel.app");
  });

  it("generates correct absolute URLs", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://boojy.vercel.app";
    expect(absoluteUrl("/products")).toBe("https://boojy.vercel.app/products");
    expect(absoluteUrl("products/123")).toBe("https://boojy.vercel.app/products/123");
  });

  it("builds indexable page metadata with Open Graph and Twitter Card", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://boojy.vercel.app";
    const meta = buildPageMetadata({
      title: "Catalog",
      description: "Browse luxury apparel",
      path: "/products",
    });

    expect(meta.description).toBe("Browse luxury apparel");
    expect(meta.alternates?.canonical).toBe("https://boojy.vercel.app/products");
    expect(meta.robots).toEqual(
      expect.objectContaining({
        index: true,
        follow: true,
      }),
    );
    expect(meta.openGraph?.title).toBe("Catalog — Boojy");
    expect((meta.twitter as { card?: string })?.card).toBe("summary_large_image");
  });

  it("builds noindex metadata for private or transactional routes", () => {
    const meta = buildPageMetadata({
      title: "Checkout",
      noIndex: true,
    });

    expect(meta.robots).toEqual(
      expect.objectContaining({
        index: false,
        follow: false,
      }),
    );
  });

  it("generates valid Schema.org Store JSON-LD with correct location and currency", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://boojy.vercel.app";
    const schema = getStoreJsonLd();

    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("ClothingStore");
    expect(schema.name).toBe("Boojy");
    expect(schema.url).toBe("https://boojy.vercel.app");
    expect(schema.address.addressLocality).toBe("Owerri");
    expect(schema.address.addressRegion).toBe("Imo State");
    expect(schema.currenciesAccepted).toBe("NGN");
  });

  it("generates valid Schema.org WebSite JSON-LD with search action", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://boojy.vercel.app";
    const schema = getWebSiteJsonLd();

    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("WebSite");
    expect(schema.potentialAction.target.urlTemplate).toContain("/products?q={search_term_string}");
  });

  it("generates valid Schema.org Product JSON-LD with Offer and stock status", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://boojy.vercel.app";
    const productSchema = getProductJsonLd({
      id: "prod_1",
      name: "Street Drips Oversized Hoodie",
      description: "Heavyweight 450GSM cotton hoodie",
      price: 45000,
      stockQuantity: 10,
      images: ["https://res.cloudinary.com/demo/image/upload/sample.jpg"],
      categoryName: "Hoodies",
    });

    expect(productSchema["@type"]).toBe("Product");
    expect(productSchema.name).toBe("Street Drips Oversized Hoodie");
    expect(productSchema.offers.price).toBe("45000.00");
    expect(productSchema.offers.priceCurrency).toBe("NGN");
    expect(productSchema.offers.availability).toBe("https://schema.org/InStock");
    expect(productSchema.sku).toBe("prod_1");
  });

  it("generates valid BreadcrumbList JSON-LD", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://boojy.vercel.app";
    const breadcrumbs = getBreadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Products", path: "/products" },
      { name: "Hoodie", path: "/products/123" },
    ]);

    expect(breadcrumbs["@type"]).toBe("BreadcrumbList");
    expect(breadcrumbs.itemListElement).toHaveLength(3);
    expect(breadcrumbs.itemListElement[0].position).toBe(1);
    expect(breadcrumbs.itemListElement[2].item).toBe("https://boojy.vercel.app/products/123");
  });
});
