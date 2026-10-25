"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Menu, X } from "lucide-react";
import { BoojyLogo } from "@/components/boojy-logo";

const drawerLinks = [
  { href: "/", label: "Home" },
  { href: "/products", label: "All Products" },
  { href: "/track", label: "Track Order" },
];

export function StorefrontDrawer() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hasOpened = useRef(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    };
  }, [open]);

  // Move focus into the panel on open and return it to the trigger on close.
  useEffect(() => {
    if (open) {
      hasOpened.current = true;
      panelRef.current?.focus();
    } else if (hasOpened.current) {
      triggerRef.current?.focus();
    }
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="store-drawer"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/*
        The overlay is portaled to <body>: the sticky header uses
        backdrop-blur, and backdrop-filter makes the header the containing
        block for fixed descendants. Without the portal, the drawer's
        `fixed inset-0` overlay would be trapped inside the 64px header
        instead of covering the viewport (invisible sidebar on mobile).
      */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50">
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="absolute inset-0 h-full w-full bg-black/50 backdrop-blur-sm"
            />
            <div
              ref={panelRef}
              id="store-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Store navigation"
              tabIndex={-1}
              className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-1 overflow-y-auto border-r border-border bg-background p-4 shadow-xl outline-none"
            >
              <div className="mb-4 flex items-center justify-between">
                <Link
                  href="/"
                  onClick={() => setOpen(false)}
                  aria-label="Boojy Home"
                  className="flex items-center"
                >
                  <BoojyLogo className="h-7 w-auto" />
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="flex flex-col gap-1 font-display">
                {drawerLinks.map((link) => {
                  const active =
                    link.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center justify-between rounded-none px-3 py-3 text-lg sm:text-xl font-bold uppercase tracking-wider transition-colors font-display ${active ? "bg-muted text-foreground font-extrabold" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
