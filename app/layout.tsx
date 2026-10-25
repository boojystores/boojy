import type { Metadata } from "next";
import { Geist, Space_Grotesk } from "next/font/google";
import localFont from "next/font/local";
import { RouteAwareThemeProvider } from "@/components/route-aware-theme-provider";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Boojy",
  description:
    "Curated streetwear, premium apparel, bespoke fits, and luxury essentials.",
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
  return (
    <html lang="en" suppressHydrationWarning>
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
