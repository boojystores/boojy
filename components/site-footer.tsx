import Link from "next/link";
import { BoojyLogo } from "@/components/boojy-logo";
import { Facebook, Instagram, Mail, MapPin, Phone } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="w-full border-t border-border/60 bg-muted/30">
      <div className="site-container py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand + Newsletter */}
          <div className="flex flex-col gap-3">
            <Link
              href="/"
              className="inline-flex items-center transition-opacity hover:opacity-80"
              aria-label="Boojy Home"
            >
              <BoojyLogo className="h-7 w-auto" />
            </Link>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Curated streetwear, premium apparel, bespoke fits, and luxury essentials.
            </p>
          </div>

          {/* Shop */}
          <div className="flex flex-col gap-2">
            <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Shop
            </h3>
            <nav className="flex flex-col gap-1.5" aria-label="Footer shop links">
              <Link
                href="/products"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                All Products
              </Link>
              <Link
                href="/products?category=joggers"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Joggers & Pants
              </Link>
              <Link
                href="/products?category=hoodies"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Hoodies & Sweats
              </Link>
              <Link
                href="/products?category=tees"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Tees & Tops
              </Link>
              <Link
                href="/cart"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Shopping Bag
              </Link>
            </nav>
          </div>

          {/* Contact */}
          <div className="flex flex-col gap-2">
            <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Contact
            </h3>
            <div className="flex flex-col gap-1.5 text-sm text-muted-foreground">
              <a
                href="mailto:boojystores@gmail.com"
                className="flex items-center gap-2 transition-colors hover:text-foreground"
              >
                <Mail className="h-3.5 w-3.5 shrink-0" />
                boojystores@gmail.com
              </a>
              <a
                href="tel:+2349022272437"
                className="flex items-center gap-2 transition-colors hover:text-foreground"
              >
                <Phone className="h-3.5 w-3.5 shrink-0" />
                +234 902 2272 437
              </a>
              <span className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                123 Streetwear Boulevard, Victoria Island, Lagos, Nigeria
              </span>
            </div>
          </div>

          {/* Follow */}
          <div className="flex flex-col gap-2">
            <h3 className="font-sans text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Follow us
            </h3>
            <div className="flex flex-col gap-1.5">
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <Facebook className="h-3.5 w-3.5 shrink-0" />
                Facebook
              </a>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <Instagram className="h-3.5 w-3.5 shrink-0" />
                Instagram
              </a>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row">
          <p>&copy; 2026 Boojy. All rights reserved.</p>
          <p className="font-display text-[11px] tracking-wide">
            ...the limitless lifestyle
          </p>
        </div>
      </div>
    </footer>
  );
}
