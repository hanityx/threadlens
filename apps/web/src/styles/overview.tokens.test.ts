import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const overviewStyles = readFileSync(new URL("./overview.css", import.meta.url), "utf8");

describe("overview token migration", () => {
  it("uses typography and blur tokens for the stage shell and summary surfaces", () => {
    expect(overviewStyles).toMatch(/\.overview-stage\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-lg\)\);/s);
    expect(overviewStyles).toMatch(/\.overview-header-btn\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-md\)\);/s);
    expect(overviewStyles).toMatch(/\.overview-command-path,\s*\.overview-command-runtime\s*{[^}]*font-size:\s*var\(--text-2xs\);/s);
    expect(overviewStyles).toMatch(/\.overview-command-summary span\s*{[^}]*font-size:\s*var\(--text-2xs\);/s);
    expect(overviewStyles).toMatch(/\.overview-primary-focus-kpis strong\s*{[^}]*font-size:\s*var\(--text-md\);/s);
  });

  it("uses typography and blur tokens for spotlight and supporting copy", () => {
    expect(overviewStyles).toMatch(/\.overview-insight-card strong\s*{[^}]*font-size:\s*var\(--text-xl\);/s);
    expect(overviewStyles).toMatch(/\.overview-insight-card p\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(overviewStyles).toMatch(/\.overview-review-meta\s*{[^}]*font-size:\s*var\(--text-3xs\);/s);
    expect(overviewStyles).toMatch(/\.overview-side-status-item span\s*{[^}]*font-size:\s*var\(--text-3xs\);/s);
    expect(overviewStyles).toMatch(/\.overview-spotlight\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-xl\)\) saturate\(190%\);/s);
    expect(overviewStyles).toMatch(/\.overview-kick-card strong\s*{[^}]*font-size:\s*var\(--text-2xl\);/s);
    expect(overviewStyles).toMatch(/\.overview-note-label\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
  });
});
