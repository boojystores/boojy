import type { Metadata } from "next";
import { getPaymentMethodsConfig } from "@/features/admin/actions/payments";
import { PaymentsManager } from "@/features/admin/components/payments-manager";

export const metadata: Metadata = {
  title: "Payment Methods — Boojy Admin",
  description: "Configure and toggle payment gateways and checkout options.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPaymentsPage() {
  const methods = await getPaymentMethodsConfig();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Payment Methods</h1>
        <p className="mt-1 text-muted-foreground">
          Turn payment options ON or OFF for your store. Only active methods appear to customers at checkout.
        </p>
      </div>

      <PaymentsManager initialMethods={methods} />
    </div>
  );
}
