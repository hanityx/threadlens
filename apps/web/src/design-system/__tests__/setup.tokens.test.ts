import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const setupStyles = readFileSync(new URL("../setup.css", import.meta.url), "utf8");

describe("setup token migration", () => {
  it("uses typography tokens for setup copy and labels", () => {
    expect(setupStyles).toMatch(/\.setup-wizard-stage-copy p\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(setupStyles).toMatch(/\.setup-wizard-stage-pill\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(setupStyles).toMatch(/\.setup-wizard-stage-card span\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(setupStyles).toMatch(/\.setup-wizard-step-index\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(setupStyles).toMatch(/\.setup-wizard-stage-copy strong\s*{[^}]*font-size:\s*var\(--text-xl\);/s);
    expect(setupStyles).toMatch(/\.setup-wizard-stage-card strong\s*{[^}]*font-size:\s*var\(--text-xl\);/s);
    expect(setupStyles).toMatch(/\.setup-wizard-step strong,\s*\.setup-wizard-copy strong,\s*\.setup-wizard-complete strong\s*{[^}]*font-size:\s*var\(--text-lg\);/s);
    expect(setupStyles).toMatch(/\.setup-wizard-step p,\s*\.setup-wizard-copy p,\s*\.setup-wizard-complete p,\s*\.setup-wizard-empty p\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(setupStyles).toMatch(/\.setup-wizard-metric span,\s*\.setup-wizard-summary-list span\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(setupStyles).toMatch(/\.setup-wizard-metric strong\s*{[^}]*font-size:\s*var\(--text-xl\);/s);
    expect(setupStyles).toMatch(/\.setup-wizard-choice-head h3\s*{[^}]*font-size:\s*var\(--text-lg\);/s);
    expect(setupStyles).toMatch(/\.overview-history-meta\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(setupStyles).toMatch(/\.overview-history-item p\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(setupStyles).toMatch(/\.degraded-banner strong\s*{[^}]*font-size:\s*var\(--text-lg\);/s);
    expect(setupStyles).toMatch(/\.degraded-banner p\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(setupStyles).toMatch(/\.degraded-banner span\s*{[^}]*font-size:\s*var\(--text-base\);/s);
  });

  it("uses semantic surface tokens for setup stages and cards", () => {
    expect(setupStyles).toMatch(/\.setup-wizard-stage\s*{[^}]*background:\s*var\(--surface-card-bg-subtle\);/s);
    expect(setupStyles).toMatch(/\.setup-wizard-stage-pill\s*{[^}]*border:\s*1px solid var\(--surface-setup-stage-pill-border\);[^}]*background:\s*var\(--surface-pill-ghost\);/s);
    expect(setupStyles).toMatch(/\.setup-wizard-stage-card\s*{[^}]*background:\s*var\(--surface-card-bg-subtle\);/s);
    expect(setupStyles).toMatch(/\.setup-wizard-complete-compact\s*{[^}]*border:\s*1px solid var\(--line-soft\);[^}]*background:\s*var\(--surface-card-bg-subtle\);/s);
    expect(setupStyles).toMatch(/\.setup-wizard-step\s*{[^}]*background:\s*var\(--surface-panel-subtle\);/s);
    expect(setupStyles).toMatch(/\.setup-wizard-step-current\s*{[^}]*border-color:\s*var\(--surface-setup-active-border\);/s);
    expect(setupStyles).toMatch(/\.setup-wizard-step-done\s*{[^}]*border-color:\s*var\(--surface-setup-step-done-border\);/s);
    expect(setupStyles).toMatch(/\.setup-wizard-body,\s*\.setup-wizard-complete\s*{[^}]*background:\s*var\(--surface-card-bg-subtle\);/s);
    expect(setupStyles).toMatch(/\.setup-wizard-metric,\s*\.setup-wizard-summary-card,\s*\.setup-wizard-empty\s*{[^}]*background:\s*var\(--surface-card-bg-subtle\);/s);
    expect(setupStyles).toMatch(/\.setup-wizard-choice\s*{[^}]*background:\s*var\(--surface-card-bg-subtle\);/s);
    expect(setupStyles).toMatch(/\.setup-wizard-choice\.is-selected\s*{[^}]*border-color:\s*var\(--surface-setup-active-border\);[^}]*background:\s*var\(--surface-setup-choice-selected-bg\);/s);
    expect(setupStyles).toMatch(/\.overview-history-item\s*{[^}]*background:\s*var\(--surface-panel-subtle\);/s);
    expect(setupStyles).toMatch(/\.degraded-banner\s*{[^}]*backdrop-filter:\s*blur\(var\(--blur-md\)\) saturate\(140%\);/s);
  });
});
