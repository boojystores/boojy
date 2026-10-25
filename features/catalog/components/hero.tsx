"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SLIDES = [
  {
    title: "New Drops",
    description: "Exclusive streetwear drops, tailored fits, and luxury apparel just landed.",
    image: "https://res.cloudinary.com/hvs9rbao/image/upload/v1792935964/adele-shafiee-vagr_XT9Cms-unsplash.jpg",
    position: "center 15%",
  },
  {
    title: "Seasonal Sale",
    description: "Up to 20% off selected luxury pieces — limited time only.",
    image: "https://res.cloudinary.com/hvs9rbao/image/upload/v1792935962/mcfollis-nIs-xAS752k-unsplash.jpg",
    position: "center 22%",
  },
  {
    title: "Limited Edition",
    description: "Bespoke cuts and statement streetwear for the bold.",
    image: "https://res.cloudinary.com/hvs9rbao/image/upload/v1792935958/kam-myers-V0u6h6BHwLU-unsplash.jpg",
    position: "center 28%",
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
      {/* Rotating background slides — no zoom, standard sizing, custom focal alignment */}
      <div className="absolute inset-0 -z-30">
        {SLIDES.map((slide, index) => (
          <div
            key={index}
            aria-hidden={index !== current}
            className={cn(
              "absolute inset-0 bg-cover transition-opacity duration-1000",
              index === current
                ? "opacity-100"
                : "opacity-0 pointer-events-none",
            )}
            style={{
              backgroundImage: `url(${slide.image})`,
              backgroundPosition: slide.position,
              transition: "opacity 1s ease",
            }}
          />
        ))}
      </div>

      {/* Write-ups & CTA anchored at bottom */}
      <div className="site-container relative z-10 flex flex-col items-center justify-end gap-3 sm:gap-4 pb-12 sm:pb-14 text-center mt-auto">
        <h1 className="font-display text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight max-w-4xl text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]">
          ...the{" "}
          <span className="bg-gradient-to-br from-white via-purple-300 to-purple-400 bg-clip-text text-transparent drop-shadow-sm">
            limitless
          </span>{" "}
          lifestyle
        </h1>

        <p className="max-w-xl text-sm sm:text-base md:text-lg leading-relaxed text-white/95 font-medium drop-shadow-[0_1px_8px_rgba(0,0,0,0.85)]">
          Curated streetwear, premium joggers, bespoke hoodies, and timeless essentials —
          designed for effortless expression.
        </p>

        <div className="flex w-full justify-center sm:w-auto pt-1">
          <Button asChild size="lg" className="w-full sm:w-auto px-8 h-12 text-xs sm:text-sm font-bold uppercase tracking-widest shadow-lg bg-black text-white hover:bg-neutral-800">
            <Link href="/products">Explore Collection</Link>
          </Button>
        </div>
      </div>

      {/* Slide indicators */}
      <div className="absolute bottom-3 sm:bottom-4 left-1/2 flex -translate-x-1/2 gap-2 z-20">
        {SLIDES.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => goTo(index)}
            aria-label={`Go to slide ${index + 1}`}
            aria-current={index === current ? "true" : undefined}
            className={cn(
              "h-2 rounded-full transition-all duration-300 shadow-sm",
              index === current
                ? "w-6 bg-white"
                : "w-2 bg-white/50 hover:bg-white/80",
            )}
          />
        ))}
      </div>
    </section>
  );
}
