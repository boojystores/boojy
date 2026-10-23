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
    const page = React.Children.toArray(doc.props.children)[0] as React.ReactElement;
    expect(page).toBeDefined();

    const header = React.Children.toArray(page.props.children)[0] as React.ReactElement;
    expect(header).toBeDefined();

    // Check header contents (Image logo + tagline)
    const headerChildren = React.Children.toArray(header.props.children);
    expect(headerChildren).toHaveLength(2);

    const imageElement = headerChildren[0] as React.ReactElement;
    expect(imageElement.props.src).toContain("boojy-dark.png");

    const taglineElement = headerChildren[1] as React.ReactElement;
    expect(taglineElement.props.children).toBe("... the limitless lifestyle");
  });

  it("respects custom logoUrl when provided", () => {
    const customLogoData: ReceiptData = {
      ...mockReceiptData,
      logoUrl: "data:image/png;base64,custom-test-logo",
    };
    const doc = ReceiptDocument({ data: customLogoData });
    const page = React.Children.toArray(doc.props.children)[0] as React.ReactElement;
    const header = React.Children.toArray(page.props.children)[0] as React.ReactElement;
    const imageElement = React.Children.toArray(header.props.children)[0] as React.ReactElement;
    expect(imageElement.props.src).toBe("data:image/png;base64,custom-test-logo");
  });
});
