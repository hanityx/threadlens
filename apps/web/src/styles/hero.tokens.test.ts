import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const heroStyles = readFileSync(new URL("./hero.css", import.meta.url), "utf8");

describe("hero token migration", () => {
  it("uses blur and typography tokens for hero badges", () => {
    expect(heroStyles).toMatch(/\.hero\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-lg\)\);/s);
    expect(heroStyles).toMatch(/\.meta-chip\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-md\)\);/s);
    expect(heroStyles).toMatch(/\.hero h1\s*{[^}]*font-size:\s*var\(--text-display-shell-hero\);/s);
    expect(heroStyles).toMatch(/\.hero-kicker\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(heroStyles).toMatch(/\.hero p\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(heroStyles).toMatch(/\.hero-badge\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(heroStyles).toMatch(/\.meta-chip\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
  });

  it("uses semantic pill surface tokens for hero chips", () => {
    expect(heroStyles).toMatch(/\.hero-badge\s*{[^}]*background:\s*var\(--surface-pill-ghost\);/s);
    expect(heroStyles).toMatch(/\.meta-chip\s*{[^}]*background:\s*var\(--surface-pill-ghost\);/s);
  });
});
