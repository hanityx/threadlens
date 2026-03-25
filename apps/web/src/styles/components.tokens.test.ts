import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentStyles = readFileSync(new URL("./components.css", import.meta.url), "utf8");

describe("components token migration", () => {
  it("uses typography tokens for shared component labels", () => {
    expect(componentStyles).toMatch(/\.kpi-value\s*{[^}]*font-size:\s*var\(--text-kpi-value\);/s);
    expect(componentStyles).toMatch(/\.kpi-label\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(componentStyles).toMatch(/\.kpi-hint\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(componentStyles).toMatch(/\.view-btn\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(componentStyles).toMatch(/\.search-input,\s*\.filter-select\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(componentStyles).toMatch(/button\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(componentStyles).toMatch(/\.panel-summary-subcopy\s*{[^}]*font-size:\s*var\(--text-base\);/s);
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
    expect(componentStyles).toMatch(/button\s*{[^}]*border:\s*0;/s);
    expect(componentStyles).toMatch(/\.btn-base\s*{[^}]*background:\s*var\(--btn-base-bg\);/s);
    expect(componentStyles).toMatch(/\.btn-accent\s*{[^}]*background:\s*var\(--btn-accent-bg\);/s);
    expect(componentStyles).toMatch(/\.btn-accent:hover\s*{[^}]*background:\s*var\(--btn-accent-hover-bg\);/s);
    expect(componentStyles).toMatch(/\.btn-outline\s*{[^}]*background:\s*var\(--surface-btn-outline\);/s);
    expect(componentStyles).toMatch(/\.btn-outline:hover\s*{[^}]*background:\s*var\(--surface-btn-outline-hover\);/s);
    expect(componentStyles).toMatch(/\.panel\s*{[^}]*background:\s*var\(--surface-panel-frosted\);[^}]*border:\s*1px solid var\(--surface-panel-border\);[^}]*box-shadow:\s*var\(--shadow-md\), inset 0 1px 0 var\(--surface-panel-sheen\);/s);
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
    expect(componentStyles).toMatch(/\.threads-table-panel tbody tr\.active-row td\s*{[^}]*background:\s*var\(--surface-active-row-bg\);/s);
  });
});
