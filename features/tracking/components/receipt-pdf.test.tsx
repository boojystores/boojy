import { describe, it, expect } from "vitest";
import React from "react";
import { ReceiptDocument, type ReceiptData } from "./receipt-pdf";

const mockReceiptData: ReceiptData = {
  orderNumber: "ORD-20261023-0001",
  totalAmount: 45000,
  paymentMethod: "ewallet",
  deliveryAddress: "Victoria Island, Lagos, Nigeria",
  customerName: "Alex Morgan",
  createdAt: "2026-10-23T14:30:00Z",
  items: [
    { name: "Heavyweight Graphic Hoodie", quantity: 1, unitPrice: 30000 },
    { name: "Structured Cargo Jogger", quantity: 1, unitPrice: 15000 },
  ],
};

describe("ReceiptDocument", () => {
  it("renders with the brand logo and updated tagline", () => {
    const doc = ReceiptDocument({ data: mockReceiptData });
    expect(doc).toBeDefined();

    // Verify document structure contains the expected children
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = React.Children.toArray(doc.props.children)[0] as any;
    expect(page).toBeDefined();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const header = React.Children.toArray(page.props.children)[0] as any;
    expect(header).toBeDefined();

    // Check header contents (Image logo + tagline)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const headerChildren = React.Children.toArray(header.props.children) as any[];
    expect(headerChildren).toHaveLength(2);

    const imageElement = headerChildren[0];
    expect(imageElement.props.src).toContain("boojy-dark.png");

    const taglineElement = headerChildren[1];
    expect(taglineElement.props.children).toBe("... the limitless lifestyle");
  });

  it("respects custom logoUrl when provided", () => {
    const customLogoData: ReceiptData = {
      ...mockReceiptData,
      logoUrl: "data:image/png;base64,custom-test-logo",
    };
    const doc = ReceiptDocument({ data: customLogoData });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = React.Children.toArray(doc.props.children)[0] as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const header = React.Children.toArray(page.props.children)[0] as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const imageElement = React.Children.toArray(header.props.children)[0] as any;
    expect(imageElement.props.src).toBe("data:image/png;base64,custom-test-logo");
  });

  it("safely handles long delivery addresses and long item names without errors", () => {
    const longAddressData: ReceiptData = {
      ...mockReceiptData,
      deliveryAddress:
        "Flat 4B, Admiralty Towers, Opposite Ebeano Supermarket, Plot 12 Admiralty Way, Lekki Phase 1, Eti-Osa LGA, Lagos State, Nigeria. Gate code: 4421. Call 08012345678 upon arrival.",
      customerName: "Dr. Oluwaseun Emmanuel Adebayo-Okonkwo",
      shippingFee: 3500,
      shippingMethodName: "Standard Nationwide Doorstep Delivery - Outside Lagos State",
      items: [
        {
          name: "Boojy Heavyweight Oversized French Terry Boxy Fit Streetwear Hoodie - Vintage Washed Onyx Black",
          size: "XL",
          quantity: 2,
          unitPrice: 35000,
        },
      ],
    };

    const doc = ReceiptDocument({ data: longAddressData });
    expect(doc).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = React.Children.toArray(doc.props.children)[0] as any;
    expect(page).toBeDefined();
  });
});
