import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { navigateToPaymentGateway } from "./navigation";

describe("navigateToPaymentGateway", () => {
  let originalWindow: any;
  let originalDocument: any;

  beforeEach(() => {
    vi.useFakeTimers();
    originalWindow = globalThis.window;
    originalDocument = globalThis.document;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
  });

  it("safely handles null, undefined, or empty string without throwing", () => {
    expect(() => navigateToPaymentGateway(null)).not.toThrow();
    expect(() => navigateToPaymentGateway(undefined)).not.toThrow();
    expect(() => navigateToPaymentGateway("   ")).not.toThrow();
  });

  it("creates and triggers a top-level link and form dispatch when DOM is available", () => {
    const appendedElements: any[] = [];
    const linkClicks: any[] = [];
    const formSubmissions: any[] = [];

    const mockDocument = {
      createElement: vi.fn((tag: string) => {
        if (tag === "a") {
          const el = {
            href: "",
            target: "",
            rel: "",
            style: {},
            click: vi.fn(() => linkClicks.push(el)),
            parentNode: null as any,
          };
          return el;
        }
        if (tag === "form") {
          const el = {
            method: "",
            action: "",
            target: "",
            style: {},
            submit: vi.fn(() => formSubmissions.push(el)),
            parentNode: null as any,
          };
          return el;
        }
        return {};
      }),
      body: {
        appendChild: vi.fn((el: any) => {
          el.parentNode = mockDocument.body;
          appendedElements.push(el);
          return el;
        }),
        removeChild: vi.fn(),
      },
    };

    const mockWindow = {
      location: {
        href: "",
        replace: vi.fn(),
      },
      top: null as any,
    };
    mockWindow.top = mockWindow;

    globalThis.window = mockWindow as any;
    globalThis.document = mockDocument as any;

    const testUrl = "https://checkout.bachs.io/c/chk_123456";
    navigateToPaymentGateway(testUrl);

    // Verify Strategy 1: Anchor tag created with target _top and clicked
    expect(mockDocument.createElement).toHaveBeenCalledWith("a");
    expect(linkClicks.length).toBe(1);
    expect(linkClicks[0].href).toBe(testUrl);
    expect(linkClicks[0].target).toBe("_top");

    // Verify Strategy 2: Form created with method GET and action targetUrl and submitted
    expect(mockDocument.createElement).toHaveBeenCalledWith("form");
    expect(formSubmissions.length).toBe(1);
    expect(formSubmissions[0].action).toBe(testUrl);
    expect(formSubmissions[0].target).toBe("_top");
    expect(formSubmissions[0].method).toBe("GET");

    // Verify Strategy 3: Location replace / assign
    expect(mockWindow.location.replace).toHaveBeenCalledWith(testUrl);

    // Advance timers for delayed cleanup and second pass
    vi.advanceTimersByTime(100);
  });
});
