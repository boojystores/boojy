"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// Module-level singleton state so StorefrontHeader and StickyCatalogToolbar
// transition synchronously on the exact same frame.
let globalHeaderHidden = false;
const listeners = new Set<(hidden: boolean) => void>();

function setGlobalHeaderHidden(hidden: boolean) {
  if (globalHeaderHidden !== hidden) {
    globalHeaderHidden = hidden;
    listeners.forEach((listener) => listener(hidden));
  }
}

export function useHeaderScroll() {
  const pathname = usePathname();
  const isProductsPage = pathname === "/products";
  const [isHeaderHidden, setIsHeaderHidden] = useState(
    isProductsPage ? globalHeaderHidden : false
  );

  useEffect(() => {
    if (!isProductsPage) {
      setGlobalHeaderHidden(false);
      setIsHeaderHidden(false);
      return;
    }

    const updateState = (hidden: boolean) => {
      setIsHeaderHidden(hidden);
    };

    listeners.add(updateState);

    let lastScrollY = window.scrollY;
    let ticking = false;

    const onScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;

          // At the top of the products page (first 60px), keep the navbar visible
          if (currentScrollY <= 60) {
            setGlobalHeaderHidden(false);
          } else if (currentScrollY > lastScrollY + 6) {
            // Scrolling down -> hide main navbar, let category bar take top-0
            setGlobalHeaderHidden(true);
          } else if (currentScrollY < lastScrollY - 6) {
            // Scrolling up -> show main navbar, category bar drops below it
            setGlobalHeaderHidden(false);
          }

          lastScrollY = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      listeners.delete(updateState);
      window.removeEventListener("scroll", onScroll);
    };
  }, [isProductsPage]);

  return {
    isProductsPage,
    isHeaderHidden: isProductsPage ? isHeaderHidden : false,
  };
}
