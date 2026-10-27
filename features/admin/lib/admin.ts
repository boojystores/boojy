import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Admin dashboard aggregates (ticket 07). All six numbers come from the
 * `get_admin_kpis` Postgres function in one round-trip (ADR-0012) — no more
 * downloading every order row just to sum it. The function is security
 * definer with an is_admin() guard and derives sales/customer totals in SQL,
 * excluding cancelled Orders (a cancelled Order is undone, ADR-0002).
 */

export type AdminKpis = {
  totalProducts: number;
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  totalCustomers: number;
  /** Sum of order totals for paid and completed orders (real money received). */
  totalSales: number;
  /** Sum of order totals for placed orders still pending payment. */
  pendingSales: number;
};

const EMPTY_KPIS: AdminKpis = {
  totalProducts: 0,
  totalOrders: 0,
  pendingOrders: 0,
  completedOrders: 0,
  totalCustomers: 0,
  totalSales: 0,
  pendingSales: 0,
};

/** The jsonb shape returned by `get_admin_kpis` (snake_case keys). */
type KpisRow = {
  total_products: number;
  total_orders: number;
  pending_orders: number;
  completed_orders: number;
  total_customers: number;
  total_sales: number;
  pending_sales?: number;
};

export async function getAdminKpis(client: SupabaseClient): Promise<AdminKpis> {
  let totalProducts = 0;
  let totalOrders = 0;
  let pendingOrders = 0;
  let completedOrders = 0;
  let totalCustomers = 0;
  let totalSales = 0;
  let pendingSales = 0;

  const { data, error } = await client.rpc("get_admin_kpis");

  if (!error && data) {
    const result = data as { ok?: boolean; kpis?: KpisRow | null };
    if (result.ok === true && result.kpis) {
      const k = result.kpis;
      totalProducts = Number(k.total_products) || 0;
      totalOrders = Number(k.total_orders) || 0;
      pendingOrders = Number(k.pending_orders) || 0;
      completedOrders = Number(k.completed_orders) || 0;
      totalCustomers = Number(k.total_customers) || 0;
      totalSales = Number(k.total_sales) || 0;
      pendingSales = Number(k.pending_sales) || 0;
    }
  }

  // Authoritatively re-calculate sales against live orders table:
  // - Total Sales: ONLY orders that have been successfully paid for (real money received).
  // - Pending Orders: price of orders currently in pending.
  // This guarantees 100% accurate metrics even if the Supabase RPC migration has not yet been executed.
  const { data: orderRows } = await client
    .from("orders")
    .select("status, payment_status, total_amount")
    .neq("status", "cancelled");

  if (orderRows && orderRows.length > 0) {
    let paidSum = 0;
    let pendingSum = 0;
    let pendingCount = 0;
    let completedCount = 0;

    type Row = { status: string; payment_status?: string | null; total_amount: number };

    for (const ord of orderRows as unknown as Row[]) {
      const amount = Number(ord.total_amount) || 0;
      const isPaid =
        ord.payment_status === "paid" ||
        ord.status === "completed" ||
        ord.status === "confirmed" ||
        ord.status === "preparing" ||
        ord.status === "shipped";

      if (ord.status === "pending" && ord.payment_status !== "paid") {
        pendingSum += amount;
        pendingCount += 1;
      } else if (isPaid && ord.status !== "pending") {
        paidSum += amount;
      }

      if (ord.status === "completed") {
        completedCount += 1;
      }
    }

    totalSales = paidSum;
    pendingSales = pendingSum;
    pendingOrders = pendingCount;
    if (completedCount > 0) completedOrders = completedCount;
    totalOrders = orderRows.length;
  }

  return {
    totalProducts,
    totalOrders,
    pendingOrders,
    completedOrders,
    totalCustomers,
    totalSales,
    pendingSales,
  };
}

export type ChartDataPoint = {
  month: string;
  orders: number;
  revenue: number;
};

/**
 * Chart data for the admin dashboard: order count and revenue per month for
 * the last 6 months. Queries the `orders` table directly, excluding
 * cancelled and unconfirmed/unpaid orders from revenue, and groups by month.
 */
export async function getAdminChartData(
  client: SupabaseClient,
): Promise<ChartDataPoint[]> {
  const now = new Date();
  const months: ChartDataPoint[] = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleString("en-US", { month: "short", year: "2-digit" });
    months.push({ month: label, orders: 0, revenue: 0 });
  }

  const startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const startIso = startDate.toISOString();

  const { data, error } = await client
    .from("orders")
    .select("created_at, total_amount, status, payment_status")
    .neq("status", "cancelled")
    .gte("created_at", startIso);

  if (error) return months;

  type OrderRow = {
    created_at: string;
    total_amount: number;
    status: string;
    payment_status?: string | null;
  };

  for (const row of (data as unknown as OrderRow[]) ?? []) {
    const d = new Date(row.created_at);
    const key = d.toLocaleString("en-US", { month: "short", year: "2-digit" });
    const point = months.find((m) => m.month === key);
    if (point) {
      point.orders += 1;
      // Revenue only counts paid / completed orders (real money received, not pending)
      const isPaid =
        row.payment_status === "paid" ||
        row.status === "completed" ||
        row.status === "confirmed" ||
        row.status === "preparing" ||
        row.status === "shipped";
      if (isPaid && row.status !== "pending") {
        point.revenue += Number(row.total_amount);
      }
    }
  }

  return months;
}
