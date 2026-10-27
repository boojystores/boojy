import { BoojyPreloader } from "@/components/boojy-preloader";

export default function CheckoutLoading() {
  return (
    <div className="flex min-h-[75vh] w-full flex-col items-center justify-center p-6">
      <BoojyPreloader size="lg" />
    </div>
  );
}
