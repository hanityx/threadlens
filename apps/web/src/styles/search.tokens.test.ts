import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const searchStyles = readFileSync(new URL("./search.css", import.meta.url), "utf8");

describe("search token migration", () => {
  it("uses blur tokens for command and result surfaces", () => {
    expect(searchStyles).toMatch(/\.search-command-shell\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-lg\)\);/s);
    expect(searchStyles).toMatch(/\.search-summary-strip\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-md\)\);/s);
    expect(searchStyles).toMatch(/\.search-live-strip\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-md\)\);/s);
  });

  it("uses typography tokens for search stage labels and support copy", () => {
    expect(searchStyles).toMatch(/\.search-stage-title p\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(searchStyles).toMatch(/\.search-command-path,\s*\.search-command-runtime\s*{[^}]*font-size:\s*var\(--text-2xs\);/s);
    expect(searchStyles).toMatch(/\.search-scope-label\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(searchStyles).toMatch(/\.search-summary-strip strong\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(searchStyles).toMatch(/\.search-dedupe-strip p,\s*\.search-empty-strip p\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
  });
});
