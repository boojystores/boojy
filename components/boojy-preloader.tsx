"use client";

import { BoojyLogo } from "@/components/boojy-logo";
import { cn } from "@/lib/utils";

export interface BoojyPreloaderProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  message?: string;
  fullscreen?: boolean;
}

/**
 * Boojy Preloader: displays the brand mark blinking slowly during loading states.
 */
export function BoojyPreloader({
  className,
  size = "md",
  message,
  fullscreen = false,
}: BoojyPreloaderProps) {
  const sizeClasses = {
    sm: "h-6 w-auto",
    md: "h-10 w-auto sm:h-12",
    lg: "h-14 w-auto sm:h-16",
  }[size];

  const content = (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 select-none",
        className,
      )}
    >
      <div className="relative animate-boojy-blink flex items-center justify-center">
        <BoojyLogo className={sizeClasses} priority />
      </div>
      {message && (
        <p className="text-xs uppercase tracking-widest text-muted-foreground animate-pulse">
          {message}
        </p>
      )}
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-sm">
        {content}
      </div>
    );
  }

  return content;
}
