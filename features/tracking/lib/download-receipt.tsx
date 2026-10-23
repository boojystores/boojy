"use client";

import { pdf } from "@react-pdf/renderer";
import { ReceiptDocument, type ReceiptData } from "@/features/tracking/components/receipt-pdf";

/**
 * Generates a PDF receipt and triggers a browser download.
 * Client-only — uses @react-pdf/renderer's pdf() to create a blob,
 * then creates a temporary download link.
 */
export async function downloadReceipt(data: ReceiptData): Promise<void> {
  try {
    let logoUrl = data.logoUrl;
    if (!logoUrl && typeof window !== "undefined") {
      try {
        const resp = await fetch("/boojy-dark.png");
        if (resp.ok) {
          const blob = await resp.blob();
          logoUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        }
      } catch {
        logoUrl = `${window.location.origin}/boojy-dark.png`;
      }
    }

    const blob = await pdf(<ReceiptDocument data={{ ...data, logoUrl }} />).toBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `boojy-receipt-${data.orderNumber}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Failed to generate receipt PDF:", err);
    throw new Error("Could not generate receipt. Please try again.");
  }
}
