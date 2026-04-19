import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const responsiveStyles = readFileSync(new URL("../styles/responsive.css", import.meta.url), "utf8");

describe("responsive token migration", () => {
  it("uses shell radius tokens for mobile overview cards", () => {
    expect(responsiveStyles).toMatch(/\.overview-command-shell,\s*\.overview-editorial,\s*\.overview-primary-card,\s*\.overview-metric-card\s*{[^}]*border-radius:\s*var\(--radius-shell-md\);/s);
  });

  it("uses typography tokens for compact mobile copy", () => {
    expect(responsiveStyles).toMatch(/\.overview-stage-title h2\s*{[^}]*font-size:\s*var\(--text-display-mobile-stage\);/s);
    expect(responsiveStyles).toMatch(/\.search-stage-title h2\s*{[^}]*font-size:\s*var\(--text-3xl\);/s);
    expect(responsiveStyles).toMatch(/\.hero h1\s*{[^}]*font-size:\s*var\(--text-display-mobile-hero\);/s);
    expect(responsiveStyles).toMatch(/\.hero p\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(responsiveStyles).toMatch(/\.meta-chip\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
  });
});
