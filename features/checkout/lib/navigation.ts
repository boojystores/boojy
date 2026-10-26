/**
 * Cross-browser Payment Gateway Navigator
 *
 * Specifically engineered to resolve iOS Safari, Mobile WebKit, and
 * in-app browser (Instagram, WhatsApp, TikTok, Twitter/X) navigation failures.
 *
 * Problem on iOS Safari:
 * Programmatic location changes (`window.location.assign` or `window.location.href`)
 * that occur after an asynchronous operation (`await submitCheckout`) are often
 * treated by WebKit as unprompted cross-origin redirects and silently ignored or dropped,
 * especially when combined with concurrent React DOM re-renders.
 *
 * Solution:
 * Multi-tiered navigation pipeline:
 * 1. Programmatic click on a detached <a> element with target="_top" and rel="noreferrer noopener".
 *    WebKit prioritizes synthetic top-level link clicks above script location writes.
 * 2. Hidden standard HTML <form method="GET" target="_top"> dispatch.
 * 3. window.location.replace (replaces history state to avoid back-button loop) & window.location.href.
 * 4. Fallback for iframes / in-app WebViews (window.top.location).
 * 5. Macro-task queue dispatch (setTimeout) to escape React's microtask / DOM mutation cycle.
 */

export function navigateToPaymentGateway(url: string | null | undefined): void {
  if (!url || typeof window === "undefined") return;

  const targetUrl = url.trim();
  if (!targetUrl) return;

  // Execute synchronously first
  executeNavigation(targetUrl);

  // Also schedule on the next macro-task tick in case WebKit dropped the first attempt
  // during React's microtask state flush
  setTimeout(() => {
    executeNavigation(targetUrl);
  }, 40);
}

function executeNavigation(targetUrl: string): void {
  if (typeof document === "undefined") return;

  // Strategy 1: Top-level anchor click dispatch
  try {
    const link = document.createElement("a");
    link.href = targetUrl;
    link.target = "_top";
    link.rel = "noreferrer noopener";
    link.style.position = "fixed";
    link.style.top = "-9999px";
    link.style.left = "-9999px";
    link.style.opacity = "0";
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try {
        if (link.parentNode) link.parentNode.removeChild(link);
      } catch {}
    }, 200);
  } catch (e) {
    console.warn("[Navigation Strategy A warn]:", e);
  }

  // Strategy 2: Form submission to target="_top"
  try {
    const form = document.createElement("form");
    form.method = "GET";
    form.action = targetUrl;
    form.target = "_top";
    form.style.position = "fixed";
    form.style.top = "-9999px";
    form.style.left = "-9999px";
    form.style.opacity = "0";
    document.body.appendChild(form);
    form.submit();
    setTimeout(() => {
      try {
        if (form.parentNode) form.parentNode.removeChild(form);
      } catch {}
    }, 200);
  } catch (e) {
    console.warn("[Navigation Strategy B warn]:", e);
  }

  // Strategy 3: Standard window.location.replace & href
  try {
    if (typeof window.location.replace === "function") {
      window.location.replace(targetUrl);
    } else {
      window.location.href = targetUrl;
    }
  } catch {
    try {
      window.location.href = targetUrl;
    } catch {}
  }

  // Strategy 4: Top window navigation for embedded WebViews / iframes
  try {
    if (window.top && window.top !== window) {
      window.top.location.href = targetUrl;
    }
  } catch {}
}
