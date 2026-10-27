import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMockSupabase, type MockSupabase } from "@/lib/testing/mock-supabase";
import { getAdminKpis } from "./admin";

const toClient = (mock: MockSupabase) => mock as unknown as SupabaseClient;

const EMPTY = {
  totalProducts: 0,
  totalOrders: 0,
  pendingOrders: 0,
  completedOrders: 0,
  totalCustomers: 0,
  totalSales: 0,
  pendingSales: 0,
};

function mockKpis(kpis: {
  total_products: number;
  total_orders: number;
  pending_orders: number;
  completed_orders: number;
  total_customers: number;
  total_sales: number;
  pending_sales?: number;
}): MockSupabase {
  const mock = createMockSupabase();
  mock.mockRpc("get_admin_kpis", () => ({ ok: true, kpis }));
  return mock;
}

describe("admin KPIs (ticket 07)", () => {
  it("maps the aggregates returned by the get_admin_kpis RPC", async () => {
    // The SQL itself (counts, total_sales for completed/paid, pending_sales) is verified
    // by supabase migration — this pins the TS mapping.
    const mock = mockKpis({
      total_products: 3,
      total_orders: 4,
      pending_orders: 2,
      completed_orders: 1,
      total_customers: 2,
      total_sales: 75.5,
      pending_sales: 25.0,
    });

    const kpis = await getAdminKpis(toClient(mock));

    expect(kpis).toEqual({
      totalProducts: 3,
      totalOrders: 4,
      pendingOrders: 2,
      completedOrders: 1,
      totalCustomers: 2,
      totalSales: 75.5,
      pendingSales: 25.0,
    });
  });

  it("reports zeroes when the store is empty", async () => {
    const mock = mockKpis({
      total_products: 0,
      total_orders: 0,
      pending_orders: 0,
      completed_orders: 0,
      total_customers: 0,
      total_sales: 0,
    });

    expect(await getAdminKpis(toClient(mock))).toEqual(EMPTY);
  });

  it("fails soft to zeroes when the RPC errors", async () => {
    const mock = createMockSupabase();
    mock.failNext({ op: "rpc", table: "get_admin_kpis" });

    expect(await getAdminKpis(toClient(mock))).toEqual(EMPTY);
  });

  it("fails soft to zeroes when the function refuses a non-admin caller", async () => {
    const mock = createMockSupabase();
    mock.mockRpc("get_admin_kpis", () => ({
      ok: false,
      message: "Admins only.",
    }));

    expect(await getAdminKpis(toClient(mock))).toEqual(EMPTY);
  });

  it("authoritatively separates paid total sales from pending orders", async () => {
    const mock = createMockSupabase({
      orders: [
        {
          id: "o1",
          order_number: "ORD-1",
          total_amount: 15000,
          status: "pending",
          payment_status: "pending",
        },
        {
          id: "o2",
          order_number: "ORD-2",
          total_amount: 30000,
          status: "confirmed",
          payment_status: "paid",
        },
        {
          id: "o3",
          order_number: "ORD-3",
          total_amount: 5000,
          status: "cancelled",
          payment_status: "unpaid",
        },
      ],
    });

    const kpis = await getAdminKpis(toClient(mock));

    // Total sales strictly only includes the paid order (30,000), not pending
    expect(kpis.totalSales).toBe(30000);
    // Pending sales includes the pending order price (15,000)
    expect(kpis.pendingSales).toBe(15000);
    expect(kpis.pendingOrders).toBe(1);
    expect(kpis.totalOrders).toBe(2);
  });
});
