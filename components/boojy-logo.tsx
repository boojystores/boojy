import Image from "next/image";
import { cn } from "@/lib/utils";

export interface BoojyLogoProps {
  /**
   * Tailwind classes to control sizing and alignment (e.g. `h-7 w-auto`).
   * Default is `h-7 w-auto object-contain`.
   */
  className?: string;
  /**
   * Next.js image priority for LCP elements (e.g. top nav, login hero).
   */
  priority?: boolean;
  /**
   * Theme variant:
   * - "auto": renders dark logo on light backgrounds and light logo on dark backgrounds (theme-adaptive)
   * - "dark": dark logo specifically for light backgrounds
   * - "light": light logo specifically for dark backgrounds
   */
  variant?: "auto" | "light" | "dark";
  /**
   * Accessible alt text for the logo image. Default is "Boojy".
   */
  alt?: string;
}

const LOGO_DARK = "/boojy-dark.png";
const LOGO_LIGHT = "/boojy-light.png";
const LOGO_WIDTH = 2021;
const LOGO_HEIGHT = 620;

/**
 * Boojy brand logo component.
 *
 * Automatically switches between:
 * - Dark logo on light backgrounds (`block dark:hidden`)
 * - Light logo on dark backgrounds (`hidden dark:block`)
 *
 * Zero layout shift, SSR-safe, CSS-driven theme switching without hydration flash.
 */
export function BoojyLogo({
  className,
  priority = false,
  variant = "auto",
  alt = "Boojy",
}: BoojyLogoProps) {
  if (variant === "dark") {
    return (
      <Image
        src={LOGO_DARK}
        alt={alt}
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        priority={priority}
        className={cn("h-7 w-auto object-contain", className)}
      />
    );
  }

  if (variant === "light") {
    return (
      <Image
        src={LOGO_LIGHT}
        alt={alt}
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        priority={priority}
        className={cn("h-7 w-auto object-contain", className)}
      />
    );
  }

  return (
    <>
      {/* Dark logo on light backgrounds */}
      <Image
        src={LOGO_DARK}
        alt={alt}
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        priority={priority}
        className={cn("block dark:hidden h-7 w-auto object-contain", className)}
      />
      {/* Light logo on dark backgrounds */}
      <Image
        src={LOGO_LIGHT}
        alt={alt}
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        priority={priority}
        className={cn("hidden dark:block h-7 w-auto object-contain", className)}
      />
    </>
  );
}
