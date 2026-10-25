import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  DEFAULT_PAYMENT_METHODS,
  getActivePaymentMethods,
  type PaymentMethodConfig,
} from "@/features/checkout/lib/payment-methods";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockUpsert = vi.fn().mockResolvedValue({ error: null });
const mockSelect = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({
      upsert: mockUpsert,
      select: () => ({
        eq: () => ({
          maybeSingle: mockSelect,
        }),
      }),
    }),
  }),
}));

import {
  getPaymentMethodsConfig,
  savePaymentMethodsConfig,
  togglePaymentMethodAction,
  addPaymentMethodAction,
  deletePaymentMethodAction,
} from "./payments";

describe("Payment Methods Configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes all core payment options in DEFAULT_PAYMENT_METHODS", () => {
    const ids = DEFAULT_PAYMENT_METHODS.map((m) => m.id);
    expect(ids).toContain("bachs");
    expect(ids).toContain("ewallet");
    expect(ids).toContain("bank_transfer");
  });

  it("getActivePaymentMethods filters only enabled options", () => {
    const methods: PaymentMethodConfig[] = [
      { id: "bachs", name: "Bachs", enabled: true, description: "", hint: "" },
      { id: "ewallet", name: "Wallet", enabled: false, description: "", hint: "" },
      { id: "bank_transfer", name: "Bank", enabled: true, description: "", hint: "" },
    ];

    const active = getActivePaymentMethods(methods);
    expect(active.map((m) => m.id)).toEqual(["bachs", "bank_transfer"]);
  });

  it("getPaymentMethodsConfig returns the active list of payment methods", async () => {
    const methods = await getPaymentMethodsConfig();
    expect(methods.length).toBeGreaterThanOrEqual(3);
    const bachs = methods.find((m) => m.id === "bachs");
    expect(bachs).toBeDefined();
  });

  it("togglePaymentMethodAction toggles a method enabled status", async () => {
    const initial = await getPaymentMethodsConfig();
    const bachsInitialState = initial.find((m) => m.id === "bachs")?.enabled ?? true;

    // Toggle to opposite state
    const res = await togglePaymentMethodAction("bachs", !bachsInitialState);
    expect(res.ok).toBe(true);
    const updatedBachs = res.methods.find((m) => m.id === "bachs");
    expect(updatedBachs?.enabled).toBe(!bachsInitialState);

    // Restore original state
    const restore = await togglePaymentMethodAction("bachs", bachsInitialState);
    expect(restore.ok).toBe(true);
    expect(restore.methods.find((m) => m.id === "bachs")?.enabled).toBe(bachsInitialState);
  });

  it("addPaymentMethodAction allows creating an extensible method and deletePaymentMethodAction removes it", async () => {
    const customMethod: PaymentMethodConfig = {
      id: "test_gateway",
      name: "Test Gateway",
      description: "Test description",
      hint: "Pay with test gateway",
      enabled: false,
    };

    const addRes = await addPaymentMethodAction(customMethod);
    expect(addRes.ok).toBe(true);
    expect(addRes.methods.some((m) => m.id === "test_gateway")).toBe(true);

    // Core methods cannot be deleted
    const coreDeleteRes = await deletePaymentMethodAction("bachs");
    expect(coreDeleteRes.ok).toBe(false);

    // Custom method can be deleted
    const delRes = await deletePaymentMethodAction("test_gateway");
    expect(delRes.ok).toBe(true);
    expect(delRes.methods.some((m) => m.id === "test_gateway")).toBe(false);
  });
});
