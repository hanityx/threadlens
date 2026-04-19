import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentStyles = readFileSync(new URL("../styles/components.css", import.meta.url), "utf8");

describe("components token migration", () => {
  it("uses typography tokens for shared component labels", () => {
    expect(componentStyles).toMatch(/\.kpi-value\s*{[^}]*font-size:\s*var\(--text-kpi-value\);/s);
    expect(componentStyles).toMatch(/\.kpi-label\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(componentStyles).toMatch(/\.kpi-hint\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(componentStyles).toMatch(/\.view-btn\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(componentStyles).toMatch(/\.search-input,\s*\.filter-select\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(componentStyles).toMatch(/button\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(componentStyles).toMatch(/\.panel-summary-subcopy\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(componentStyles).toMatch(/\.panel-header-title\s*{[^}]*color:\s*var\(--text\);[^}]*font-size:\s*var\(--text-lg\);/s);
    expect(componentStyles).toMatch(/\.panel-header-subtitle\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(componentStyles).toMatch(/\.status-pill\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(componentStyles).toMatch(/\.status-pill-action\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(componentStyles).toMatch(/\.provider-slow-badge\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(componentStyles).toMatch(/\.inline-link-btn\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(componentStyles).toMatch(/\.mono-sub\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(componentStyles).toMatch(/\.notes-col\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(componentStyles).toMatch(/summary\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(componentStyles).toMatch(/pre\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(componentStyles).toMatch(/\.error-box\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(componentStyles).toMatch(/\.error-stack-head strong\s*{[^}]*font-size:\s*var\(--text-lg\);/s);
    expect(componentStyles).toMatch(/\.busy-indicator\s*{[^}]*font-size:\s*var\(--text-md\);/s);
  });

  it("uses semantic surfaces and blur tokens for shared controls", () => {
    expect(componentStyles).toMatch(/\.kpi-card\s*{[^}]*background:\s*var\(--surface-card-bg-subtle\);/s);
    expect(componentStyles).toMatch(/\.kpi-card:nth-child\(1\)\s*{[^}]*background:\s*var\(--surface-kpi-info\);/s);
    expect(componentStyles).toMatch(/\.kpi-card:nth-child\(4\)\s*{[^}]*background:\s*var\(--surface-kpi-warn\);/s);
    expect(componentStyles).toMatch(/\.kpi-card:nth-child\(5\)\s*{[^}]*background:\s*var\(--surface-kpi-success\);/s);
    expect(componentStyles).toMatch(/\.search-input,\s*\.filter-select\s*{[^}]*border:\s*1px solid var\(--surface-form-field-border\);[^}]*background:\s*var\(--surface-form-field-bg\);/s);
    expect(componentStyles).toMatch(/\.toolbar-search-shell\s*{[^}]*border:\s*1px solid var\(--surface-card-border\);[^}]*background:\s*var\(--surface-search-command-bar\);/s);
    expect(componentStyles).toMatch(/\.toolbar-search-input,\s*\.toolbar-search-select\s*{[^}]*background:\s*transparent;[^}]*color:\s*var\(--text\);/s);
    expect(componentStyles).toMatch(/button\s*{[^}]*border:\s*0;/s);
    expect(componentStyles).toMatch(/\.btn-base\s*{[^}]*background:\s*var\(--btn-base-bg\);/s);
    expect(componentStyles).toMatch(/\.btn-base:hover\s*{[^}]*background:\s*var\(--btn-base-hover-bg\);/s);
    expect(componentStyles).toMatch(/\.btn-accent\s*{[^}]*background:\s*var\(--btn-accent-bg\);/s);
    expect(componentStyles).toMatch(/\.btn-accent:hover\s*{[^}]*background:\s*var\(--btn-accent-hover-bg\);/s);
    expect(componentStyles).toMatch(/\.btn-accent\s*{[^}]*color:\s*var\(--surface-active-text\);/s);
    expect(componentStyles).toMatch(/\.btn-danger\s*{[^}]*color:\s*var\(--btn-danger-text\);/s);
    expect(componentStyles).toMatch(/\.btn-outline\s*{[^}]*background:\s*var\(--surface-btn-outline\);[^}]*color:\s*var\(--btn-outline-text\);/s);
    expect(componentStyles).toMatch(/\.btn-outline:hover\s*{[^}]*background:\s*var\(--surface-btn-outline-hover\);/s);
    expect(componentStyles).toMatch(/\.table-select-target\s*{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
    expect(componentStyles).toMatch(/\.table-select-checkbox\s*{[^}]*appearance:\s*auto;[^}]*color-scheme:\s*light;[^}]*accent-color:\s*var\(--accent\);/s);
    expect(componentStyles).toMatch(/\.check-inline input\[type=\"checkbox\"\]\s*{[^}]*color-scheme:\s*light;[^}]*accent-color:\s*var\(--accent\);/s);
    expect(componentStyles).toMatch(/:root\[data-theme="dark"\] \.table-select-checkbox,\s*:root\[data-theme="dark"\] \.check-inline input\[type="checkbox"\]\s*{[^}]*color-scheme:\s*dark;/s);
    expect(componentStyles).toMatch(/\.panel\s*{[^}]*background:\s*var\(--surface-panel-frosted\);[^}]*border:\s*1px solid var\(--surface-panel-border\);[^}]*box-shadow:\s*var\(--shadow-md\), inset 0 1px 0 var\(--surface-panel-sheen\);/s);
    expect(componentStyles).toMatch(/\.panel > \.panel-header\s*{[^}]*display:\s*flex;[^}]*gap:\s*12px;[^}]*color:\s*var\(--text\);/s);
    expect(componentStyles).toMatch(/\.panel-header-subtitle\s*{[^}]*color:\s*var\(--text-secondary\);/s);
    expect(componentStyles).toMatch(/\.layout-nav\s*{[^}]*background:\s*var\(--surface-nav-subtle\);[^}]*backdrop-filter:\s*blur\(var\(--blur-lg\)\) saturate\(165%\);/s);
    expect(componentStyles).toMatch(/\.view-btn:hover\s*{[^}]*background:\s*var\(--surface-pill-ghost\);/s);
    expect(componentStyles).toMatch(/\.panel\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-md\)\) saturate\(150%\);/s);
    expect(componentStyles).toMatch(/\.error-box\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-md\)\) saturate\(140%\);/s);
    expect(componentStyles).toMatch(/\.error-stack\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-md\)\) saturate\(140%\);/s);
    expect(componentStyles).toMatch(/\.busy-indicator\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-md\)\) saturate\(140%\);/s);
    expect(componentStyles).toMatch(/\.status-pill\s*{[^}]*border:\s*0;/s);
    expect(componentStyles).toMatch(/\.provider-slow-badge\s*{[^}]*background:\s*var\(--surface-provider-slow-badge\);/s);
    expect(componentStyles).toMatch(/\.provider-slow-row td\s*{[^}]*background:\s*var\(--surface-provider-slow-row\);/s);
    expect(componentStyles).toMatch(/\.provider-slow-row:hover td\s*{[^}]*background:\s*var\(--surface-provider-slow-row-hover\);/s);
  });
});
