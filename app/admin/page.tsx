import {
  Banknote,
  CheckCircle2,
  Clock3,
  Package,
  ShoppingBag,
  Users,
} from "lucide-react";
import { KpiCard } from "@/features/admin/components/kpi-card";
import { AdminCharts } from "@/features/admin/components/admin-charts";
import { getAdminKpis, getAdminChartData } from "@/features/admin/lib/admin";
import { createClient } from "@/lib/supabase/server";
import { priceFormatter as currency } from "@/lib/currency";

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const [kpis, chartData] = await Promise.all([
    getAdminKpis(supabase),
    getAdminChartData(supabase),
  ]);

  const cards = [
    {
      label: "Total Sales",
      value: currency.format(kpis.totalSales),
      subtitle: "Successfully paid orders",
      icon: Banknote,
    },
    {
      label: "Pending Orders",
      value: currency.format(kpis.pendingSales),
      subtitle: `${kpis.pendingOrders.toLocaleString()} awaiting order${kpis.pendingOrders === 1 ? "" : "s"}`,
      icon: Clock3,
    },
    {
      label: "Completed Orders",
      value: kpis.completedOrders.toLocaleString(),
      subtitle: "Fulfilled & delivered",
      icon: CheckCircle2,
    },
    {
      label: "Total Orders",
      value: kpis.totalOrders.toLocaleString(),
      subtitle: "All orders placed",
      icon: ShoppingBag,
    },
    {
      label: "Total Customers",
      value: kpis.totalCustomers.toLocaleString(),
      subtitle: "Customer accounts",
      icon: Users,
    },
    {
      label: "Total Products",
      value: kpis.totalProducts.toLocaleString(),
      subtitle: "Active catalog items",
      icon: Package,
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">
          Overview of the store, updated live as Customers place orders.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      <AdminCharts data={chartData} />
    </div>
  );
}
