import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const layoutStyles = readFileSync(new URL("../layout.css", import.meta.url), "utf8");

describe("layout token migration", () => {
  it("uses blur and typography tokens for shell controls", () => {
    expect(layoutStyles).toMatch(/\.shell-rail\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-lg\)\);/s);
    expect(layoutStyles).toMatch(/\.top-actions\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-lg\)\);/s);
    expect(layoutStyles).toMatch(/\.shell-rail-mark\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(layoutStyles).toMatch(/\.top-actions-label\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(layoutStyles).toMatch(/\.shell-rail-brand strong,\s*\.top-actions-copy strong\s*{[^}]*font-size:\s*var\(--text-lg\);/s);
    expect(layoutStyles).toMatch(/\.shell-rail-brand strong\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(layoutStyles).toMatch(/\.shell-rail-btn-key\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(layoutStyles).toMatch(/\.shell-rail-btn-label\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(layoutStyles).toMatch(/\.top-search-icon\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(layoutStyles).toMatch(/\.top-search-input\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(layoutStyles).toMatch(/\.top-surface-btn\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(layoutStyles).toMatch(/\.top-actions-copy strong\s*{[^}]*font-size:\s*var\(--text-lg\);/s);
    expect(layoutStyles).toMatch(/\.top-sync-status\s*{[^}]*font-size:\s*var\(--text-2xs\);/s);
    expect(layoutStyles).toMatch(/\.provider-quick-switch\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(layoutStyles).toMatch(/\.lang-btn\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(layoutStyles).toMatch(/\.density-btn\s*{[^}]*font-size:\s*var\(--text-base\);/s);
  });

  it("uses semantic surface tokens for rail and nav surfaces", () => {
    expect(layoutStyles).toMatch(/\.shell-rail\s*{[^}]*background:\s*var\(--surface-card-bg-subtle\);/s);
    expect(layoutStyles).toMatch(/\.shell-rail-mark\s*{[^}]*background:\s*var\(--surface-card-bg-ghost\);/s);
    expect(layoutStyles).toMatch(/\.shell-rail-btn\s*{[^}]*background:\s*var\(--surface-card-bg-ghost\);/s);
    expect(layoutStyles).toMatch(/\.shell-rail-footer\s*{[^}]*background:\s*var\(--surface-card-bg-ghost\);/s);
    expect(layoutStyles).toMatch(/\.top-search-shell\s*{[^}]*background:\s*var\(--surface-nav-subtle\);/s);
    expect(layoutStyles).toMatch(/\.top-search-input::placeholder\s*{[^}]*color:\s*var\(--text-top-search-placeholder\);/s);
    expect(layoutStyles).toMatch(/\.top-surface-btn\s*{[^}]*color:\s*var\(--text-top-surface-btn\);/s);
    expect(layoutStyles).toMatch(/\.provider-quick-select\s*{[^}]*border:\s*1px solid var\(--surface-provider-select-border\);[^}]*background:\s*var\(--surface-provider-select-bg\);[^}]*box-shadow:\s*var\(--surface-provider-select-sheen\);/s);
  });
});
