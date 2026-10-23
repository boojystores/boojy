import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BoojyLogo } from "./boojy-logo";

describe("BoojyLogo", () => {
  it("renders both dark and light variants by default for automatic theme switching", () => {
    const html = renderToStaticMarkup(<BoojyLogo />);

    // Dark logo should be shown in light mode (hidden in dark mode)
    expect(html).toContain("boojy-dark.png");
    expect(html).toContain("block dark:hidden");

    // Light logo should be shown in dark mode (hidden in light mode)
    expect(html).toContain("boojy-light.png");
    expect(html).toContain("hidden dark:block");
  });

  it("renders only dark logo when variant is 'dark'", () => {
    const html = renderToStaticMarkup(<BoojyLogo variant="dark" />);

    expect(html).toContain("boojy-dark.png");
    expect(html).not.toContain("boojy-light.png");
  });

  it("renders only light logo when variant is 'light'", () => {
    const html = renderToStaticMarkup(<BoojyLogo variant="light" />);

    expect(html).toContain("boojy-light.png");
    expect(html).not.toContain("boojy-dark.png");
  });

  it("applies custom className and alt text", () => {
    const html = renderToStaticMarkup(
      <BoojyLogo className="h-10 w-auto" alt="Custom Brand Mark" />,
    );

    expect(html).toContain("h-10 w-auto");
    expect(html).toContain('alt="Custom Brand Mark"');
  });
});
