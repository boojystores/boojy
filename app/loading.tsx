import { BoojyPreloader } from "@/components/boojy-preloader";

export default function Loading() {
  return (
    <div className="flex min-h-[70vh] w-full items-center justify-center">
      <BoojyPreloader size="md" message="Loading Boojy…" />
    </div>
  );
}
