/**
 * Validation utilities for customer checkout
 */

// Email must contain @ and a valid domain extension with at least 2 characters (.com, .ng, .org, etc.)
export const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Validates that an email is well-formed and has a valid domain extension
 */
export function isValidEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return false;
  return EMAIL_RE.test(email.trim());
}

/**
 * Validates that a phone number contains numbers only, no letters,
 * and has a valid length (10 to 15 digits).
 */
export function isValidPhoneNumber(phone: string | null | undefined): boolean {
  if (!phone || typeof phone !== "string") return false;
  const trimmed = phone.trim();

  // Reject if any alphabetic letters exist
  if (/[a-zA-Z]/.test(trimmed)) return false;

  // Must match phone character pattern (digits, optional leading +, spaces, hyphens, parentheses)
  if (!/^[0-9+\s\-()]+$/.test(trimmed)) return false;

  // Extract pure digits
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * Sanitizes phone input in real-time by stripping all non-phone/non-digit characters
 */
export function sanitizePhoneInput(input: string): string {
  if (!input) return "";
  return input.replace(/[^0-9+\s\-()]/g, "").trimStart();
}
