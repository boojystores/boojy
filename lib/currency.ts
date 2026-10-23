/**
 * Currency configuration and formatting utilities for Boojy.
 *
 * Configured for Nigerian Naira (NGN / ₦).
 */
export const CURRENCY_CODE = "NGN";
export const CURRENCY_SYMBOL = "₦";
export const CURRENCY_LOCALE = "en-NG";

/**
 * Standard currency formatter for Nigerian Naira.
 * Formats numbers into currency strings (e.g. ₦15,000 or ₦2,450.50).
 */
export const priceFormatter = new Intl.NumberFormat(CURRENCY_LOCALE, {
  style: "currency",
  currency: CURRENCY_CODE,
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/**
 * Convenience helper to format numeric amounts to Naira.
 */
export function formatPrice(amount: number): string {
  return priceFormatter.format(amount);
}
