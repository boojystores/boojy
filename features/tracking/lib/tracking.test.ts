import { describe, it, expect, vi } from "vitest";
import { trackOrder } from "./tracking";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("trackOrder (case-insensitive lookup)", () => {
  it("normalizes lowercase and mixed case order numbers and email before querying", async () => {
    const mockClient = {
      rpc: vi.fn().mockImplementation(() => {
        return Promise.resolve({
          data: {
            order_number: "ORD-20261024-0001",
            status: "pending",
            total_amount: 15000,
            payment_method: "ewallet",
            delivery_address: "Lekki Phase 1, Lagos",
            created_at: "2026-10-24T00:00:00Z",
            customer_name: "John Doe",
            items: [
              {
                product_name: "Graphic Hoodie",
                image_url: null,
                quantity: 1,
                unit_price: 15000,
              },
            ],
          },
          error: null,
        });
      }),
    } as unknown as SupabaseClient;

    // Test with lowercase letters and whitespace
    const result = await trackOrder(
      mockClient,
      "  ord-20261024-0001  ",
      "  User@Example.COM  ",
    );

    expect(result).not.toBeNull();
    expect(result?.orderNumber).toBe("ORD-20261024-0001");
    expect(mockClient.rpc).toHaveBeenCalledWith("track_order", {
      p_order_number: "ORD-20261024-0001",
      p_email: "user@example.com",
    });
  });

  it("returns null if order number or email is empty", async () => {
    const mockClient = {
      rpc: vi.fn(),
    } as unknown as SupabaseClient;

    const result1 = await trackOrder(mockClient, "   ", "test@example.com");
    expect(result1).toBeNull();

    const result2 = await trackOrder(mockClient, "ORD-1234", "   ");
    expect(result2).toBeNull();

    expect(mockClient.rpc).not.toHaveBeenCalled();
  });
});
