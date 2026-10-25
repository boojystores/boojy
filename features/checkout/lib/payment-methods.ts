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
    name: "Card & Bank Transfer",
    description: "Accept debit/credit cards, USSD, and bank transfers with instant verification.",
    hint: "Pay securely with Debit Card or Bank Transfer.",
    badge: "",
    enabled: true,
    provider: "bachs",
    supportedCurrencies: ["NGN"],
  },
  {
    id: "ewallet",
    name: "Instant Transfer / E-Wallet",
    description: "Accept mobile wallet transfers from popular apps like OPay, PalmPay, and instant payment services.",
    hint: "Pay with OPay, PalmPay, or mobile wallet.",
    badge: "",
    enabled: true,
    provider: "ewallet",
    supportedCurrencies: ["NGN"],
  },
  {
    id: "bank_transfer",
    name: "Direct Bank Transfer",
    description: "Accept direct manual transfers to the official Boojy store account.",
    hint: "Transfer directly to store account — payment details sent via email.",
    badge: "",
    enabled: true,
    provider: "bank_transfer",
    supportedCurrencies: ["NGN"],
  },
];

export function getActivePaymentMethods(methods: PaymentMethodConfig[]): PaymentMethodConfig[] {
  return methods.filter((m) => m.enabled);
}
