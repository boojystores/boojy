import type { Metadata } from "next";
import { Suspense } from "react";
import { BoojyPreloader } from "@/components/boojy-preloader";
import AdminGate from "@/features/admin/components/admin-gate";

export const metadata: Metadata = {
  title: "Admin Dashboard — Boojy",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-muted/30">
          <BoojyPreloader size="md" />
        </div>
      }
    >
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}
