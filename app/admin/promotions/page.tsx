import type { Metadata } from "next";
import { getPromoConfig } from "@/features/admin/actions/promotions";
import { PromotionsManager } from "@/features/admin/components/promotions-manager";

export const metadata: Metadata = {
  title: "Promotions & Ads — Boojy Admin",
  description: "Configure in-grid promotional campaigns and advertisement cards.",
};

export default async function AdminPromotionsPage() {
  const config = await getPromoConfig();

  return <PromotionsManager initialConfig={config} />;
}
