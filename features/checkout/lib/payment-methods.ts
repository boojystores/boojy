export type PaymentMethodId = "bachs" | "ewallet" | "bank_transfer" | string;

export type PaymentMethodConfig = {
  id: PaymentMethodId;
  name: string;
  description: string;
  hint: string;
  badge?: string;
  enabled: boolean;
  provider?: string;
  instructions?: string;
  supportedCurrencies?: string[];
};

export const DEFAULT_PAYMENT_METHODS: PaymentMethodConfig[] = [
  {
    id: "bachs",
    name: "Cards & Bank Transfer (Bachs.io)",
    description: "Accept automated debit/credit card payments and bank transfers with instant verification via Bachs.io.",
    hint: "Pay securely with Debit Card or Bank Transfer via Bachs.",
    badge: "Automated Gateway",
    enabled: true,
    provider: "bachs",
    supportedCurrencies: ["NGN"],
  },
  {
    id: "ewallet",
    name: "Instant Transfer / E-Wallet",
    description: "Accept direct wallet transfers from popular services like OPay, PalmPay, and instant payment apps.",
    hint: "Bank transfer, OPay, PalmPay, or instant wallet.",
    badge: "Mobile Wallets",
    enabled: true,
    provider: "ewallet",
    supportedCurrencies: ["NGN"],
  },
  {
    id: "bank_transfer",
    name: "Direct Bank Transfer",
    description: "Accept direct transfers to the official Boojy store account with order reference.",
    hint: "Transfer directly to store account — payment details sent via email.",
    badge: "Manual Verification",
    enabled: true,
    provider: "bank_transfer",
    supportedCurrencies: ["NGN"],
  },
];

export function getActivePaymentMethods(methods: PaymentMethodConfig[]): PaymentMethodConfig[] {
  return methods.filter((m) => m.enabled);
}
