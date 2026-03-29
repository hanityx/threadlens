import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const overviewStyles = readFileSync(new URL("./overview.css", import.meta.url), "utf8");

describe("overview token migration", () => {
  it("uses typography and blur tokens for the stage shell and summary surfaces", () => {
    expect(overviewStyles).toMatch(/\.overview-stage\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-lg\)\);/s);
    expect(overviewStyles).toMatch(/\.overview-main-title p\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(overviewStyles).toMatch(/\.overview-stage-title p\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(overviewStyles).toMatch(/\.overview-header-btn\s*{[^}]*font-size:\s*var\(--text-sm\);[^}]*backdrop-filter:\s*blur\(var\(--blur-md\)\);/s);
    expect(overviewStyles).toMatch(/\.overview-command-path,\s*\.overview-command-runtime\s*{[^}]*font-size:\s*var\(--text-2xs\);/s);
    expect(overviewStyles).toMatch(/\.overview-command-summary strong\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(overviewStyles).toMatch(/\.overview-command-summary span\s*{[^}]*font-size:\s*var\(--text-2xs\);/s);
    expect(overviewStyles).toMatch(/\.overview-command-metrics span\s*{[^}]*font-size:\s*var\(--text-2xs\);/s);
    expect(overviewStyles).toMatch(/\.overview-primary-focus-kpis strong\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(overviewStyles).toMatch(/\.overview-command-shell\s*{[^}]*background:\s*var\(--surface-card-strong-ghost\);[^}]*backdrop-filter:\s*blur\(var\(--blur-lg\)\);/s);
    expect(overviewStyles).toMatch(/\.overview-primary-focus-kpis article\s*{[^}]*background:\s*var\(--surface-card-bg-ghost\);[^}]*backdrop-filter:\s*blur\(var\(--blur-md\)\);/s);
    expect(overviewStyles).toMatch(/\.overview-primary-list-item\s*{[^}]*background:\s*var\(--surface-card-strong-subtle\);/s);
    expect(overviewStyles).toMatch(/\.overview-primary-list-item strong\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(overviewStyles).toMatch(/\.overview-primary-list-item span,\s*\.overview-primary-list-empty\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
  });

  it("uses typography and blur tokens for spotlight and supporting copy", () => {
    expect(overviewStyles).toMatch(/\.overview-insight-card strong\s*{[^}]*font-size:\s*var\(--text-xl\);/s);
    expect(overviewStyles).toMatch(/\.overview-insight-card p\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(overviewStyles).toMatch(/\.overview-insight-card\.is-primary strong\s*{[^}]*font-size:\s*var\(--text-2xl\);/s);
    expect(overviewStyles).toMatch(/\.overview-insight-card\.is-mini strong\s*{[^}]*font-size:\s*var\(--text-xl\);/s);
    expect(overviewStyles).toMatch(/\.overview-insight-card\.is-mini p\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(overviewStyles).toMatch(/\.overview-review-pill\s*{[^}]*background:\s*var\(--surface-card-bg-subtle\);[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(overviewStyles).toMatch(/\.overview-review-meta\s*{[^}]*font-size:\s*var\(--text-3xs\);/s);
    expect(overviewStyles).toMatch(/\.overview-side-status-item span\s*{[^}]*font-size:\s*var\(--text-3xs\);/s);
    expect(overviewStyles).toMatch(/\.overview-side-status-item strong\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(overviewStyles).toMatch(/\.overview-status-grid article\s*{[^}]*background:\s*var\(--surface-card-bg-ghost\);[^}]*backdrop-filter:\s*blur\(var\(--blur-lg\)\);/s);
    expect(overviewStyles).toMatch(/\.overview-status-grid strong\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(overviewStyles).toMatch(/\.overview-spotlight\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-xl\)\) saturate\(190%\);/s);
    expect(overviewStyles).toMatch(/\.overview-kick-card strong\s*{[^}]*font-size:\s*var\(--text-2xl\);/s);
    expect(overviewStyles).toMatch(/\.overview-note-label\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(overviewStyles).toMatch(/\.overview-insight-card\s*{[^}]*background:\s*var\(--surface-card-bg-subtle\);[^}]*backdrop-filter:\s*blur\(var\(--blur-lg\)\);/s);
    expect(overviewStyles).toMatch(/\.overview-review-list-item\s*{[^}]*background:\s*var\(--surface-card-bg-ghost\);[^}]*backdrop-filter:\s*blur\(var\(--blur-md\)\);/s);
    expect(overviewStyles).toMatch(/\.overview-side-card\s*{[^}]*background:\s*var\(--surface-stage-ghost\);[^}]*backdrop-filter:\s*blur\(var\(--blur-xl\)\);/s);
    expect(overviewStyles).toMatch(/\.overview-card-action\s*{[^}]*background:\s*var\(--surface-pill-ghost\);[^}]*backdrop-filter:\s*blur\(var\(--blur-md\)\);/s);
  });

  it("uses typography tokens for overview review, side rail, and spotlight copy", () => {
    expect(overviewStyles).toMatch(/\.overview-command-slash\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(overviewStyles).toMatch(/\.overview-command-metrics strong\s*{[^}]*font-size:\s*var\(--text-2xs\);/s);
    expect(overviewStyles).toMatch(/\.overview-primary-focus-meta\s*{[^}]*font-size:\s*var\(--text-2xs\);/s);
    expect(overviewStyles).toMatch(/\.overview-primary-focus-kpis span\s*{[^}]*font-size:\s*var\(--text-2xs\);/s);
    expect(overviewStyles).toMatch(/\.overview-insight-card\.is-review strong\s*{[^}]*font-size:\s*var\(--text-2xl\);/s);
    expect(overviewStyles).toMatch(/\.overview-review-title\s*{[^}]*font-size:\s*var\(--text-2xl\);/s);
    expect(overviewStyles).toMatch(/\.overview-review-list-item strong\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(overviewStyles).toMatch(/\.overview-review-list-item span\s*{[^}]*font-size:\s*var\(--text-3xs\);/s);
    expect(overviewStyles).toMatch(/\.overview-side-head strong\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(overviewStyles).toMatch(/\.overview-side-head\.is-history strong\s*{[^}]*font-size:\s*var\(--text-xl\);/s);
    expect(overviewStyles).toMatch(/\.overview-side-group-head span\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(overviewStyles).toMatch(/\.overview-side-item-meta\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(overviewStyles).toMatch(/\.overview-side-item-copy strong\s*{[^}]*font-size:\s*var\(--text-xl\);/s);
    expect(overviewStyles).toMatch(/\.overview-side-item-copy p,\s*\.overview-side-empty\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(overviewStyles).toMatch(/\.overview-action-pill span\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(overviewStyles).toMatch(/\.overview-primary-card p\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(overviewStyles).toMatch(/\.overview-spotlight > header h2\s*{[^}]*font-size:\s*var\(--text-lg\);/s);
    expect(overviewStyles).toMatch(/\.overview-status-strip\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-xl\)\) saturate\(185%\);/s);
    expect(overviewStyles).toMatch(/\.overview-status-strip span\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(overviewStyles).toMatch(/\.overview-resume-card strong\s*{[^}]*font-size:\s*var\(--text-lg\);/s);
    expect(overviewStyles).toMatch(/\.overview-resume-card p\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(overviewStyles).toMatch(/\.overview-operator-card strong\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(overviewStyles).toMatch(/\.overview-operator-card p\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(overviewStyles).toMatch(/\.overview-spotlight-copy strong\s*{[^}]*font-size:\s*var\(--text-xl\);/s);
    expect(overviewStyles).toMatch(/\.overview-spotlight-copy p\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(overviewStyles).toMatch(/\.overview-demo-step strong\s*{[^}]*font-size:\s*var\(--text-lg\);/s);
    expect(overviewStyles).toMatch(/\.overview-demo-step p\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(overviewStyles).toMatch(/\.overview-kick-card p\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(overviewStyles).toMatch(/\.overview-secondary-close\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(overviewStyles).toMatch(/\.overview-secondary-note\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(overviewStyles).toMatch(/\.overview-provider-meta\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(overviewStyles).toMatch(/\.overview-note-card strong\s*{[^}]*font-size:\s*var\(--text-2xl\);/s);
  });

  it("uses display and compact surface tokens for the remaining overview raw literals", () => {
    expect(overviewStyles).toMatch(/\.overview-main-title h1\s*{[^}]*font-size:\s*var\(--text-display-hero\);/s);
    expect(overviewStyles).toMatch(/\.overview-stage-title h2\s*{[^}]*font-size:\s*var\(--text-display-stage\);/s);
    expect(overviewStyles).toMatch(/\.overview-action-pill strong\s*{[^}]*font-size:\s*var\(--text-2xs\);/s);
    expect(overviewStyles).toMatch(/\.overview-primary-card strong\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(overviewStyles).toMatch(/\.overview-resume-card\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-xl\)\) saturate\(195%\);/s);
    expect(overviewStyles).toMatch(/\.overview-operator-card\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-xl\)\) saturate\(185%\);/s);
    expect(overviewStyles).toMatch(/\.status-pill\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
  });

  it("uses semantic tokens for the remaining overview command, history, and panel surfaces", () => {
    expect(overviewStyles).toMatch(/\.overview-window-dots span\s*{[^}]*border:\s*1px solid var\(--surface-overview-window-dot-border\);[^}]*background:\s*var\(--surface-overview-window-dot-bg\);/s);
    expect(overviewStyles).toMatch(/\.overview-window-dots span:nth-child\(2\),\s*\.overview-window-dots span:nth-child\(3\)\s*{[^}]*background:\s*var\(--surface-overview-window-dot-muted\);/s);
    expect(overviewStyles).toMatch(/\.overview-command-path\.is-active\s*{[^}]*background:\s*var\(--surface-search-breadcrumb-active\);/s);
    expect(overviewStyles).toMatch(/\.overview-card-action\.is-quiet\s*{[^}]*border-color:\s*var\(--surface-overview-card-action-quiet-border\);/s);
    expect(overviewStyles).toMatch(/\.overview-side-head strong\s*{[^}]*color:\s*var\(--text-overview-side-head\);/s);
    expect(overviewStyles).toMatch(/\.overview-side-head-icon\s*{[^}]*color:\s*var\(--text-overview-side-icon\);/s);
    expect(overviewStyles).toMatch(/\.overview-side-item-history\s*{[^}]*background:\s*var\(--surface-overview-history-item-bg\);[^}]*border-color:\s*var\(--surface-overview-history-item-border\);/s);
    expect(overviewStyles).toMatch(/\.overview-side-item-history:hover,\s*\.overview-side-item-history:focus-visible\s*{[^}]*background:\s*var\(--surface-overview-history-item-hover-bg\);/s);
    expect(overviewStyles).toMatch(/\.overview-side-item-dots span\s*{[^}]*background:\s*var\(--surface-overview-muted-dot\);/s);
    expect(overviewStyles).toMatch(/\.overview-side-status-item\s*{[^}]*background:\s*var\(--surface-card-bg-ghost\);/s);
    expect(overviewStyles).toMatch(/\.overview-demo-step\s*{[^}]*border:\s*1px solid var\(--surface-overview-demo-border\);[^}]*background:\s*var\(--surface-overview-demo-bg\);/s);
    expect(overviewStyles).toMatch(/\.overview-demo-step::before\s*{[^}]*box-shadow:\s*var\(--shadow-overview-demo-step\);/s);
    expect(overviewStyles).toMatch(/\.overview-kick-card\s*{[^}]*border:\s*1px solid var\(--surface-overview-kick-border\);[^}]*background:\s*var\(--surface-overview-kick-bg\);/s);
    expect(overviewStyles).toMatch(/\.overview-secondary-panel\s*{[^}]*background:\s*var\(--surface-card-bg-subtle\);/s);
    expect(overviewStyles).toMatch(/\.overview-secondary-close\s*{[^}]*background:\s*transparent;/s);
    expect(overviewStyles).toMatch(/\.overview-provider-card,\s*\.overview-note-card\s*{[^}]*background:\s*var\(--surface-panel-subtle-max\);/s);
  });
});
