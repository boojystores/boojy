function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Shown when checkout cannot start a payment session. */
export function paymentErrorDocument(message: string): string {
  const safe = escapeHtml(message || "Payment could not be opened. Go back and try again.");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Payment not opened</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh; display: grid; place-items: center; background: #fff; color: #111; }
  main { text-align: center; max-width: 28rem; padding: 24px; }
  a { display: inline-block; margin-top: 16px; color: #111; font-weight: 700; }
</style>
</head>
<body>
<main>
  <p>${safe}</p>
  <a href="/checkout">Back to checkout</a>
</main>
</body>
</html>`;
}
