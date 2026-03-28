import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const searchStyles = readFileSync(new URL("./search.css", import.meta.url), "utf8");

describe("search token migration", () => {
  it("uses blur tokens for command and result surfaces", () => {
    expect(searchStyles).toMatch(/\.search-command-shell\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-lg\)\);/s);
    expect(searchStyles).toMatch(/\.search-summary-strip\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-sm\)\);/s);
    expect(searchStyles).toMatch(/\.search-live-strip\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-md\)\);/s);
  });

  it("uses typography tokens for search stage labels and support copy", () => {
    expect(searchStyles).toMatch(/\.search-stage-title h2\s*{[^}]*font-size:\s*var\(--text-display-search-stage\);/s);
    expect(searchStyles).toMatch(/\.search-stage-title p\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(searchStyles).toMatch(/\.search-stage-badge\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(searchStyles).toMatch(/\.search-command-path,\s*\.search-command-runtime\s*{[^}]*font-size:\s*var\(--text-2xs\);/s);
    expect(searchStyles).toMatch(/\.search-scope-label\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(searchStyles).toMatch(/\.search-guide-grid article p\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(searchStyles).toMatch(/\.search-result-title-stack strong\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(searchStyles).toMatch(/\.search-summary-strip strong\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(searchStyles).toMatch(/\.search-dedupe-strip p,\s*\.search-empty-strip p\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(searchStyles).toMatch(/\.search-command-slash\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(searchStyles).toMatch(/\.search-command-prompt\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(searchStyles).toMatch(/\.search-input-stage\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(searchStyles).toMatch(/\.search-command-shortcut kbd\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(searchStyles).toMatch(/\.search-command-head strong\s*{[^}]*font-size:\s*var\(--text-lg\);/s);
    expect(searchStyles).toMatch(/\.search-command-head span:last-child\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(searchStyles).toMatch(/\.search-match-role\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(searchStyles).toMatch(/\.search-result-meta\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(searchStyles).toMatch(/\.search-result-kind\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(searchStyles).toMatch(/\.search-result-snippet\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(searchStyles).toMatch(/\.search-match-more\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(searchStyles).toMatch(/\.search-inline-pill\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(searchStyles).toMatch(/\.btn-link-inline\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(searchStyles).toMatch(/\.search-preview-head strong\s*{[^}]*font-size:\s*var\(--text-lg\);/s);
  });

  it("uses semantic surface tokens for shared card and stage fills", () => {
    expect(searchStyles).toMatch(/\.search-command-shell\s*{[^}]*background:\s*var\(--surface-search-command-shell\);/s);
    expect(searchStyles).toMatch(/\.search-command-path\.is-active\s*{[^}]*background:\s*var\(--surface-search-breadcrumb-active\);/s);
    expect(searchStyles).toMatch(/\.search-command-bar\s*{[^}]*background:\s*var\(--surface-search-command-bar\);/s);
    expect(searchStyles).toMatch(/\.search-input-stage::placeholder\s*{[^}]*color:\s*var\(--text-search-muted\);/s);
    expect(searchStyles).toMatch(/\.search-command-shortcut\s*{[^}]*color:\s*var\(--text-search-muted\);/s);
    expect(searchStyles).toMatch(/\.search-command-shortcut kbd\s*{[^}]*background:\s*var\(--surface-search-command-kbd\);/s);
    expect(searchStyles).toMatch(/\.search-guide-grid article\s*{[^}]*background:\s*var\(--surface-search-guide-card\);/s);
    expect(searchStyles).toMatch(/\.search-summary-strip\s*{[^}]*background:\s*var\(--surface-nav-ghost\);/s);
    expect(searchStyles).toMatch(/\.search-live-strip\s*{[^}]*background:\s*var\(--surface-card-bg-subtle\);/s);
    expect(searchStyles).toMatch(/\.search-idle-strip\s*{[^}]*background:\s*var\(--surface-search-command-bar\);/s);
    expect(searchStyles).toMatch(/\.search-result-card-stage\s*{[^}]*background:\s*var\(--surface-search-result-stage\);/s);
    expect(searchStyles).toMatch(/\.search-result-card-stage:hover,\s*\.search-result-card-stage:focus-visible\s*{[^}]*background:\s*var\(--surface-search-result-stage-hover\);/s);
    expect(searchStyles).toMatch(/\.search-dedupe-strip,\s*\.search-empty-strip\s*{[^}]*background:\s*var\(--surface-search-inline-strip\);[^}]*border-color:\s*var\(--surface-search-inline-strip-border\);/s);
    expect(searchStyles).toMatch(/\.search-live-dot\s*{[^}]*background:\s*var\(--surface-search-live-dot\);[^}]*box-shadow:\s*var\(--shadow-search-live-dot\);/s);
    expect(searchStyles).toMatch(/\.search-loading-row\s*{[^}]*background:\s*var\(--surface-search-loading-row\);/s);
    expect(searchStyles).toMatch(/\.search-group-header\s*{[^}]*border-bottom:\s*2px solid var\(--line\);/s);
    expect(searchStyles).toMatch(/\.search-match-item\s*{[^}]*border-top:\s*1px solid var\(--surface-divider-soft\);/s);
    expect(searchStyles).toMatch(/\.search-result-card\s*{[^}]*background:\s*var\(--surface-card-strong-subtle\);/s);
    expect(searchStyles).toMatch(/\.search-result-card:hover,\s*\.search-result-card:focus-visible\s*{[^}]*border-color:\s*var\(--surface-search-result-hover-border\);[^}]*background:\s*var\(--surface-search-result-hover\);/s);
    expect(searchStyles).toMatch(/\.search-pill\s*{[^}]*border:\s*1px solid var\(--surface-pill-border\);[^}]*background:\s*var\(--surface-pill-ghost\);[^}]*box-shadow:\s*var\(--surface-pill-shadow\);/s);
    expect(searchStyles).toMatch(/\.search-pill\.status-active\s*{[^}]*background:\s*var\(--success-dim\);[^}]*color:\s*var\(--success\);/s);
    expect(searchStyles).toMatch(/\.search-inline-pill\s*{[^}]*background:\s*var\(--surface-search-inline-pill\);/s);
    expect(searchStyles).toMatch(/\.search-inline-pill:hover\s*{[^}]*color:\s*var\(--text-search-inline-hover\);/s);
    expect(searchStyles).toMatch(/\.btn-link-inline\s*{[^}]*color:\s*var\(--text-search-link-soft\);/s);
    expect(searchStyles).toMatch(/\.btn-link-inline:hover\s*{[^}]*color:\s*var\(--text-search-link-strong\);/s);
    expect(searchStyles).toMatch(/\.search-result-card\.is-active\s*{[^}]*border-color:\s*var\(--surface-search-result-active-border\);[\s\S]*?var\(--shadow-search-result-active-glow\)/s);
    expect(searchStyles).toMatch(/\.search-preview-rail\s*{[^}]*background:\s*var\(--surface-stage-subtle\);/s);
    expect(searchStyles).toMatch(/\.search-preview-snippet\s*{[^}]*background:\s*var\(--surface-card-bg-subtle\);/s);
    expect(searchStyles).toMatch(/\.search-preview-empty\s*{[^}]*border:\s*1px dashed var\(--surface-search-preview-empty-border\);[^}]*background:\s*var\(--surface-search-preview-empty-bg\);/s);
    expect(searchStyles).toMatch(/\.search-idle-strip\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-md\)\);/s);
    expect(searchStyles).toMatch(/\.search-result-card\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-md\)\);/s);
  });
});
