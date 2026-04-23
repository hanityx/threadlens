import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const threadStyles = readFileSync(new URL("./threads.css", import.meta.url), "utf8");

describe("threads token migration", () => {
  it("uses blur tokens for sticky and command surfaces", () => {
    expect(threadStyles).toMatch(/\.cleanup-toolbar\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-lg\)\);/s);
    expect(threadStyles).toMatch(/\.sticky-action-bar\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-sm\)\);/s);
    expect(threadStyles).toMatch(/\.sub-toolbar\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-sm\)\) saturate\(120%\);/s);
  });

  it("uses typography tokens for shared thread labels", () => {
    expect(threadStyles).toMatch(/\.search-scope-label,\s*\.toolbar-label\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(threadStyles).toMatch(/\.thread-workflow-copy\s*{[^}]*padding:\s*8px 0 10px;/s);
    expect(threadStyles).toMatch(/\.thread-workflow-copy strong\s*{[^}]*font-size:\s*var\(--text-display-search-stage\);/s);
    expect(threadStyles).toMatch(/\.thread-workflow-copy p\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
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
    expect(threadStyles).toMatch(/\.sub-toolbar\s*{[^}]*border-bottom:\s*1px solid var\(--surface-divider-faint\);[^}]*background:\s*var\(--surface-card-strong-subtle\);/s);
    expect(threadStyles).toMatch(/\.cleanup-toolbar\s*{[^}]*background:\s*var\(--surface-search-command-shell\);/s);
    expect(threadStyles).toMatch(/\.thread-status-card\s*{[^}]*background:\s*var\(--surface-thread-status-card\);/s);
    expect(threadStyles).toMatch(/\.thread-status-card\.is-ready\s*{[^}]*border-color:\s*var\(--surface-thread-status-ready-border\);[^}]*background:\s*var\(--surface-thread-status-ready-bg\);/s);
    expect(threadStyles).toMatch(/\.thread-status-card\.is-accent\s*{[^}]*border-color:\s*var\(--surface-thread-status-accent-border\);[^}]*box-shadow:\s*var\(--shadow-thread-status-accent\),\s*var\(--surface-card-shadow\);/s);
    expect(threadStyles).toMatch(/\.sticky-action-bar\s*{[^}]*background:\s*var\(--surface-card-bg-subtle\);/s);
    expect(threadStyles).toMatch(/\.cleanup-toolbar \.search-input,\s*\.cleanup-toolbar \.filter-select\s*{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
    expect(threadStyles).toMatch(/\.provider-result-card\s*{[^}]*background:\s*var\(--surface-panel-subtle\);/s);
    expect(threadStyles).toMatch(/\.provider-result-card-export\s*{[^}]*border-color:\s*var\(--surface-workspace-active-border\);[^}]*background:\s*var\(--surface-provider-result-export\);/s);
    expect(threadStyles).toMatch(/\.provider-result-card code\s*{[^}]*background:\s*var\(--surface-provider-result-code\);/s);
  });

  it("keeps the thread workbench shell without owning shared segmented controls", () => {
    expect(threadStyles).toMatch(/\.threads-table-panel\s*{[^}]*border:\s*1px solid var\(--surface-stage-border\);[^}]*background:\s*var\(--surface-card-bg-subtle\);/s);
    expect(threadStyles).toMatch(/\.threads-table-panel \.table-wrap\s*{[^}]*min-height:\s*50vh;[^}]*max-height:\s*54vh;/s);
    expect(threadStyles).toMatch(/\.ops-layout\.is-thread-active \.threads-table-panel\s*{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*auto auto minmax\(0,\s*1fr\) auto;/s);
    expect(threadStyles).toMatch(/\.threads-table-panel table\s*{[^}]*width:\s*100%;[^}]*table-layout:\s*fixed;/s);
    expect(threadStyles).toMatch(/\.threads-table-panel th,\s*\.threads-table-panel td\s*{[^}]*font-size:\s*var\(--text-md\);[^}]*white-space:\s*nowrap;/s);
    expect(threadStyles).toMatch(/\.threads-table-panel thead th\s*{[^}]*font-size:\s*var\(--text-xs\);[^}]*letter-spacing:\s*0\.04em;[^}]*text-transform:\s*none;/s);
    expect(threadStyles).toMatch(/\.threads-table-panel \.table-select-column,\s*\.threads-table-panel \.table-select-cell\s*{[^}]*width:\s*42px;[^}]*min-width:\s*42px;/s);
    expect(threadStyles).toMatch(/@media \(max-width:\s*1280px\)[\s\S]*?\.threads-table-panel \.col-workspace\s*{[^}]*width:\s*134px;/s);
    expect(threadStyles).not.toContain(".sessions-action-tool-btn");
  });
});
