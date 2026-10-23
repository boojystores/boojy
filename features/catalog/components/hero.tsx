"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SLIDES = [
  {
    title: "New Drops",
    description: "Exclusive streetwear drops, tailored fits, and luxury apparel just landed.",
    image: "https://images.unsplash.com/photo-1577401239170-897942555fb3?w=1400&h=700&fit=crop",
  },
  {
    title: "Seasonal Sale",
    description: "Up to 20% off selected luxury pieces — limited time only.",
    image: "https://images.unsplash.com/photo-1560343776-97e7d202ff0e?w=1400&h=700&fit=crop",
  },
  {
    title: "Limited Edition",
    description: "Bespoke cuts and statement streetwear for the bold.",
    image: "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=1400&h=700&fit=crop",
  },
];

export function Hero() {
  const [current, setCurrent] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopAutoplay = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
  }, []);

  const startAutoplay = useCallback(() => {
    stopAutoplay();
    timer.current = setInterval(() => {
      setCurrent((i) => (i + 1) % SLIDES.length);
    }, 5000);
  }, [stopAutoplay]);

  useEffect(() => {
    startAutoplay();
    return () => stopAutoplay();
  }, [startAutoplay, stopAutoplay]);

  function goTo(index: number) {
    setCurrent(index);
    startAutoplay();
  }

  return (
    <section className="relative overflow-hidden flex flex-col justify-end h-[85vh] min-h-[85vh] md:h-[calc(100vh-5rem)] md:min-h-[calc(100vh-5rem)]">
      {/* Rotating background slides */}
      <div className="absolute inset-0 -z-30">
        {SLIDES.map((slide, index) => (
          <div
            key={index}
            aria-hidden={index !== current}
            className={cn(
              "absolute inset-0 bg-cover bg-center transition-opacity duration-1000",
              index === current
                ? "opacity-100 scale-100"
                : "opacity-0 scale-105",
            )}
            style={{
              backgroundImage: `url(${slide.image})`,
              transition: "opacity 1s ease, transform 6s ease",
            }}
          />
        ))}
      </div>

      {/* Gradient overlay — adapts to theme, darker at bottom for text legibility */}
      <div className="absolute inset-0 -z-20 bg-gradient-to-t from-background via-background/70 to-background/20 dark:from-background dark:via-background/70 dark:to-transparent" />

      {/* Faint lattice — background accent */}
      <div
        aria-hidden
        className="bg-grid pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_55%_55%_at_50%_30%,black,transparent)]"
      />

      {/* Write-ups & CTA anchored at bottom */}
      <div className="site-container relative z-10 flex flex-col items-center justify-end gap-3 sm:gap-4 pb-12 sm:pb-14 text-center mt-auto">
        <h1 className="font-display text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight max-w-4xl">
          ...the{" "}
          <span className="bg-gradient-to-br from-primary to-purple-600 bg-clip-text text-transparent">
            limitless
          </span>{" "}
          lifestyle
        </h1>

        <p className="max-w-xl text-sm sm:text-base md:text-lg leading-relaxed text-foreground/80">
          Curated streetwear, premium joggers, bespoke hoodies, and timeless essentials —
          designed for effortless expression.
        </p>

        <div className="flex w-full justify-center sm:w-auto pt-1">
          <Button asChild size="lg" className="w-full sm:w-auto px-8 h-12 text-xs sm:text-sm font-bold uppercase tracking-widest shadow-md">
            <Link href="/products">Explore Collection</Link>
          </Button>
        </div>
      </div>

      {/* Slide indicators */}
      <div className="absolute bottom-3 sm:bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
        {SLIDES.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => goTo(index)}
            aria-label={`Go to slide ${index + 1}`}
            aria-current={index === current ? "true" : undefined}
            className={cn(
              "h-2 rounded-full transition-all duration-300",
              index === current
                ? "w-6 bg-primary"
                : "w-2 bg-muted-foreground/40 hover:bg-muted-foreground/60",
            )}
          />
        ))}
      </div>
    </section>
  );
}
