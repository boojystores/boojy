import { Suspense } from "react";
import { BoojyPreloader } from "@/components/boojy-preloader";
import AdminGate from "@/features/admin/components/admin-gate";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-muted/30">
          <BoojyPreloader size="md" message="Loading dashboard…" />
        </div>
      }
    >
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}
