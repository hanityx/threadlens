import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const threadStyles = readFileSync(new URL("./threads.css", import.meta.url), "utf8");

describe("threads token migration", () => {
  it("uses blur tokens for sticky and command surfaces", () => {
    expect(threadStyles).toMatch(/\.cleanup-command-shell\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-md\)\) saturate\(130%\);/s);
    expect(threadStyles).toMatch(/\.sticky-action-bar\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-sm\)\);/s);
  });

  it("uses typography tokens for shared thread labels", () => {
    expect(threadStyles).toMatch(/\.search-scope-label,\s*\.toolbar-label\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(threadStyles).toMatch(/\.panel header span\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(threadStyles).toMatch(/\.panel h2\s*{[^}]*font-size:\s*var\(--text-lg\);/s);
    expect(threadStyles).toMatch(/\.thread-status-card span\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(threadStyles).toMatch(/\.provider-result-card p\s*{[^}]*font-size:\s*var\(--text-md\);/s);
  });
});
