import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const threadStyles = readFileSync(new URL("./threads.css", import.meta.url), "utf8");

describe("threads token migration", () => {
  it("uses blur tokens for sticky and command surfaces", () => {
    expect(threadStyles).toMatch(/\.cleanup-command-shell\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-md\)\) saturate\(130%\);/s);
    expect(threadStyles).toMatch(/\.sticky-action-bar\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-sm\)\);/s);
    expect(threadStyles).toMatch(/\.sub-toolbar\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-sm\)\) saturate\(120%\);/s);
  });

  it("uses typography tokens for shared thread labels", () => {
    expect(threadStyles).toMatch(/\.search-scope-label,\s*\.toolbar-label\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(threadStyles).toMatch(/\.panel header span\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(threadStyles).toMatch(/\.panel h2\s*{[^}]*font-size:\s*var\(--text-lg\);/s);
    expect(threadStyles).toMatch(/\.thread-workflow-copy strong\s*{[^}]*font-size:\s*var\(--text-lg\);/s);
    expect(threadStyles).toMatch(/\.thread-workflow-copy p\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(threadStyles).toMatch(/\.cleanup-command-shell > header h2\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(threadStyles).toMatch(/\.cleanup-command-shell > header span\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(threadStyles).toMatch(/\.thread-status-card span\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(threadStyles).toMatch(/\.thread-status-card strong\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(threadStyles).toMatch(/\.thread-status-card p\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(threadStyles).toMatch(/\.thread-toolbar-group strong\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(threadStyles).toMatch(/\.provider-action-toolbar-copy strong\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(threadStyles).toMatch(/\.provider-result-card strong\s*{[^}]*font-size:\s*var\(--text-lg\);/s);
    expect(threadStyles).toMatch(/\.provider-result-card p\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(threadStyles).toMatch(/\.provider-result-card code\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(threadStyles).toMatch(/\.check-inline\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(threadStyles).toMatch(/\.sub-hint\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(threadStyles).toMatch(/\.info-box strong\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(threadStyles).toMatch(/\.info-box p\s*{[^}]*font-size:\s*var\(--text-md\);/s);
  });

  it("uses semantic surface tokens for sticky thread surfaces", () => {
    expect(threadStyles).toMatch(/\.panel header\s*{[^}]*background:\s*var\(--surface-panel-header\);/s);
    expect(threadStyles).toMatch(/\.sub-toolbar\s*{[^}]*border-bottom:\s*1px solid var\(--surface-divider-faint\);[^}]*background:\s*var\(--surface-card-strong-subtle\);/s);
    expect(threadStyles).toMatch(/\.cleanup-command-shell\s*{[^}]*background:\s*var\(--surface-stage-subtle\);/s);
    expect(threadStyles).toMatch(/\.cleanup-command-shell > header\s*{[^}]*background:\s*var\(--surface-cleanup-header\);/s);
    expect(threadStyles).toMatch(/\.thread-status-card\s*{[^}]*background:\s*var\(--surface-thread-status-card\);/s);
    expect(threadStyles).toMatch(/\.thread-status-card\.is-ready\s*{[^}]*border-color:\s*var\(--surface-thread-status-ready-border\);[^}]*background:\s*var\(--surface-thread-status-ready-bg\);/s);
    expect(threadStyles).toMatch(/\.thread-status-card\.is-accent\s*{[^}]*border-color:\s*var\(--surface-thread-status-accent-border\);[^}]*box-shadow:\s*var\(--shadow-thread-status-accent\),\s*var\(--surface-card-shadow\);/s);
    expect(threadStyles).toMatch(/\.sticky-action-bar\s*{[^}]*background:\s*var\(--surface-card-bg-subtle\);/s);
    expect(threadStyles).toMatch(/\.provider-result-card\s*{[^}]*background:\s*var\(--surface-panel-subtle\);/s);
    expect(threadStyles).toMatch(/\.provider-result-card-export\s*{[^}]*border-color:\s*var\(--surface-workspace-active-border\);[^}]*background:\s*var\(--surface-provider-result-export\);/s);
    expect(threadStyles).toMatch(/\.provider-result-card code\s*{[^}]*background:\s*var\(--surface-provider-result-code\);/s);
  });
});
