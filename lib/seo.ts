import type { Metadata } from "next";

/**
 * Canonical website URL configuration.
 * Always resolves to a clean, absolute HTTPS URL without trailing slashes.
 */
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`.replace(/\/+$/, "");
  }
  return "https://boojy.vercel.app";
}

export function absoluteUrl(path = "/"): string {
  const base = getSiteUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export const SEO_CONFIG = {
  siteName: "Boojy",
  defaultTitle: "Boojy — Curated Streetwear & Luxury Apparel",
  titleTemplate: "%s — Boojy",
  description:
    "Curated streetwear, premium apparel, bespoke fits, and luxury essentials. Shop oversized tees, hoodies, and contemporary Nigerian fashion.",
  locale: "en_NG",
  telephone: "+2349022272437",
  address: {
    streetAddress: "Owerri",
    addressLocality: "Owerri",
    addressRegion: "Imo State",
    addressCountry: "NG",
  },
  social: {
    instagram: "https://instagram.com",
    twitter: "https://twitter.com",
    facebook: "https://facebook.com",
  },
  keywords: [
    "Boojy",
    "streetwear",
    "Nigerian streetwear",
    "luxury apparel",
    "oversized tees",
    "streetwear hoodies",
    "bespoke fits",
    "contemporary clothing",
    "Owerri fashion",
    "Nigerian fashion brand",
  ],
} as const;

/**
 * Reusable metadata builder ensuring consistent Open Graph, Twitter cards,
 * canonical URLs, and robots directives.
 */
export function buildPageMetadata({
  title,
  description,
  path = "/",
  keywords,
  image,
  imageAlt,
  noIndex = false,
  type = "website",
}: {
  title?: string;
  description?: string;
  path?: string;
  keywords?: string[];
  image?: string;
  imageAlt?: string;
  noIndex?: boolean;
  type?: "website" | "article";
}): Metadata {
  const pageUrl = absoluteUrl(path);
  const pageTitle = title ? `${title} — ${SEO_CONFIG.siteName}` : SEO_CONFIG.defaultTitle;
  const pageDescription = description || SEO_CONFIG.description;
  const ogImage = image || absoluteUrl("/opengraph-image.png");
  const ogImageAlt = imageAlt || `${SEO_CONFIG.siteName} — ${SEO_CONFIG.defaultTitle}`;

  return {
    title: title ? title : { absolute: SEO_CONFIG.defaultTitle },
    description: pageDescription,
    keywords: keywords || [...SEO_CONFIG.keywords],
    alternates: {
      canonical: pageUrl,
    },
    robots: noIndex
      ? {
          index: false,
          follow: false,
          googleBot: {
            index: false,
            follow: false,
          },
        }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-video-preview": -1,
            "max-image-preview": "large",
            "max-snippet": -1,
          },
        },
    openGraph: {
      type,
      title: pageTitle,
      description: pageDescription,
      url: pageUrl,
      siteName: SEO_CONFIG.siteName,
      locale: SEO_CONFIG.locale,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 600,
          alt: ogImageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description: pageDescription,
      images: [ogImage],
    },
  };
}

/**
 * Schema.org Organization / OnlineStore structured data.
 */
export function getStoreJsonLd() {
  const siteUrl = getSiteUrl();

  return {
    "@context": "https://schema.org",
    "@type": "ClothingStore",
    "@id": `${siteUrl}/#organization`,
    name: SEO_CONFIG.siteName,
    url: siteUrl,
    logo: absoluteUrl("/boojy-dark.png"),
    image: absoluteUrl("/opengraph-image.png"),
    description: SEO_CONFIG.description,
    telephone: SEO_CONFIG.telephone,
    address: {
      "@type": "PostalAddress",
      addressLocality: SEO_CONFIG.address.addressLocality,
      addressRegion: SEO_CONFIG.address.addressRegion,
      addressCountry: SEO_CONFIG.address.addressCountry,
    },
    currenciesAccepted: "NGN",
    paymentAccepted: "Card, Bank Transfer, USSD",
    priceRange: "₦₦",
    sameAs: [
      SEO_CONFIG.social.instagram,
      SEO_CONFIG.social.twitter,
      SEO_CONFIG.social.facebook,
    ],
  };
}

/**
 * Schema.org WebSite structured data with Sitelinks Searchbox.
 */
export function getWebSiteJsonLd() {
  const siteUrl = getSiteUrl();

  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    url: siteUrl,
    name: SEO_CONFIG.siteName,
    description: SEO_CONFIG.description,
    inLanguage: "en-NG",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}/products?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * Schema.org BreadcrumbList structured data.
 */
export function getBreadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

/**
 * Schema.org Product structured data for e-commerce Product Detail Pages.
 */
export function getProductJsonLd({
  id,
  name,
  description,
  price,
  stockQuantity,
  images,
  categoryName,
}: {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  stockQuantity: number;
  images: string[];
  categoryName?: string;
}) {
  const productUrl = absoluteUrl(`/products/${id}`);
  const formattedImages = images.map((img) =>
    img.startsWith("http") ? img : absoluteUrl(img),
  );

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${productUrl}#product`,
    name,
    description: description || `Shop the ${name} at ${SEO_CONFIG.siteName}.`,
    image: formattedImages.length > 0 ? formattedImages : [absoluteUrl("/opengraph-image.png")],
    sku: id,
    brand: {
      "@type": "Brand",
      name: SEO_CONFIG.siteName,
    },
    category: categoryName || "Apparel",
    offers: {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: "NGN",
      price: price.toFixed(2),
      availability:
        stockQuantity > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: {
        "@type": "Organization",
        name: SEO_CONFIG.siteName,
      },
    },
  };
}
