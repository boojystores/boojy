import type { Metadata } from "next";
import { Geist, Space_Grotesk } from "next/font/google";
import localFont from "next/font/local";
import { RouteAwareThemeProvider } from "@/components/route-aware-theme-provider";
import "./globals.css";

import { getSiteUrl, SEO_CONFIG, getStoreJsonLd, getWebSiteJsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: SEO_CONFIG.defaultTitle,
    template: SEO_CONFIG.titleTemplate,
  },
  description: SEO_CONFIG.description,
  keywords: [...SEO_CONFIG.keywords],
  authors: [{ name: "Boojy" }],
  creator: "Boojy",
  publisher: "Boojy",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: "./",
  },
  robots: {
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
    type: "website",
    locale: SEO_CONFIG.locale,
    url: getSiteUrl(),
    siteName: SEO_CONFIG.siteName,
    title: SEO_CONFIG.defaultTitle,
    description: SEO_CONFIG.description,
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 600,
        alt: `${SEO_CONFIG.siteName} — ${SEO_CONFIG.defaultTitle}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SEO_CONFIG.defaultTitle,
    description: SEO_CONFIG.description,
    images: ["/twitter-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

// Street Drips by Blankids brand typeface with regular and extrude weights
const streetDrips = localFont({
  src: [
    {
      path: "../public/fonts/StreetDrips.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/StreetDripsExtrude.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-street-drips",
  display: "swap",
  fallback: [
    "ui-sans-serif",
    "system-ui",
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "Roboto",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
});

const streetDripsExtrude = localFont({
  src: "../public/fonts/StreetDripsExtrude.ttf",
  variable: "--font-street-drips-extrude",
  weight: "700",
  style: "normal",
  display: "swap",
  fallback: [
    "ui-sans-serif",
    "system-ui",
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "Roboto",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
});

// Mona Sans by GitHub — ultra-legible modern variable sans for body, forms, UI, and details
const monaSans = localFont({
  src: "../public/fonts/MonaSans.woff2",
  variable: "--font-mona-sans",
  display: "swap",
  weight: "200 900",
  fallback: [
    "-apple-system",
    "BlinkMacSystemFont",
    "Segoe UI",
    "Roboto",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
});

// Geist and Space Grotesk serve as secondary UI fallbacks
const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  display: "swap",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const storeSchema = getStoreJsonLd();
  const websiteSchema = getWebSiteJsonLd();

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(storeSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
      </head>
      <body
        className={`${streetDrips.variable} ${streetDripsExtrude.variable} ${monaSans.variable} ${geistSans.variable} ${spaceGrotesk.variable} font-sans antialiased`}
      >
        <RouteAwareThemeProvider>
          {children}
        </RouteAwareThemeProvider>
      </body>
    </html>
  );
}
