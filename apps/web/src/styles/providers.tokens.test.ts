import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const providerStyles = readFileSync(new URL("./providers.css", import.meta.url), "utf8");

describe("providers token migration", () => {
  it("uses blur tokens for stage-level shells", () => {
    expect(providerStyles).toMatch(/\.provider-archive-stage\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-lg\)\);/s);
    expect(providerStyles).toMatch(/\.provider-advanced-shell\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-md\)\);/s);
    expect(providerStyles).toMatch(/\.provider-session-stage\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-lg\)\);/s);
    expect(providerStyles).toMatch(/th\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-sm\)\);/s);
  });

  it("uses typography tokens for shared provider labels", () => {
    expect(providerStyles).toMatch(/\.provider-workspace-recent-item \.sub-hint\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(providerStyles).toMatch(/\.provider-grid-intro-copy p\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(providerStyles).toMatch(/\.provider-advanced-shell summary\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(providerStyles).toMatch(/\.provider-advanced-shell \.panel-summary-subcopy\s*{[^}]*font-size:\s*var\(--text-2xs\);/s);
    expect(providerStyles).toMatch(/\.session-routing-disclosure-state\s*{[^}]*font-size:\s*var\(--text-2xs\);/s);
    expect(providerStyles).toMatch(/\.provider-session-table \.mono-sub\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(providerStyles).toMatch(/\.capability-chip\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(providerStyles).toMatch(/\.provider-tab-title\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(providerStyles).toMatch(/\.threads-table-panel \.status-pill\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(providerStyles).toMatch(/th\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
  });
});
