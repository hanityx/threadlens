import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sessionDetailStyles = readFileSync(new URL("../styles/session-detail.css", import.meta.url), "utf8");

describe("session detail token migration", () => {
  it("uses typography tokens for review and detail labels", () => {
    expect(sessionDetailStyles).toMatch(/\.thread-review-card span\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-card strong\s*{[^}]*font-size:\s*var\(--text-lg\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-card p\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(sessionDetailStyles).toMatch(/\.detail-section > summary\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(sessionDetailStyles).toMatch(/\.detail-section-static-head\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(sessionDetailStyles).toMatch(/\.detail-hero-copy strong\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(sessionDetailStyles).toMatch(/\.detail-hero-copy p\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(sessionDetailStyles).toMatch(/\.detail-hero-pill\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(sessionDetailStyles).toMatch(/\.detail-hero-session-compact \.detail-hero-copy strong\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(sessionDetailStyles).toMatch(/\.detail-hero-session-compact \.detail-hero-copy p\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-detail-empty-state strong\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-detail-empty-state p\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-detail-empty-next \.overview-note-label\s*{[^}]*font-size:\s*var\(--text-2xs\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-detail-empty-next strong\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-detail-empty-next p\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(sessionDetailStyles).toMatch(/\.session-detail-empty-next strong\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(sessionDetailStyles).toMatch(/\.session-detail-empty-next p\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(sessionDetailStyles).toMatch(/\.detail-hero-session-compact \.detail-hero-pill\s*{[^}]*font-size:\s*var\(--text-2xs\);/s);
    expect(sessionDetailStyles).toMatch(/\.session-detail-panel \.transcript-summary-main strong\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(sessionDetailStyles).toMatch(/\.session-detail-panel \.transcript-summary-meta\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(sessionDetailStyles).toMatch(/\.session-detail-empty-next \.overview-note-label\s*{[^}]*font-size:\s*var\(--text-2xs\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-panel \.detail-section > summary,\s*\.thread-review-panel \.detail-section-static-head\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-panel \.transcript-summary-main strong\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-panel \.transcript-summary-meta\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-panel \.impact-list h3\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-empty-guide span\s*{[^}]*font-size:\s*var\(--text-2xs\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-empty-guide strong\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-empty-guide p\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-panel \.chat-item header strong\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-panel \.chat-item header span\s*{[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-panel \.chat-item p\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(sessionDetailStyles).toMatch(/\.impact-kv > span\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(sessionDetailStyles).toMatch(/\.impact-list h3\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(sessionDetailStyles).toMatch(/\.impact-list li\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
  });

  it("uses semantic surface tokens for review and detail shells", () => {
    expect(sessionDetailStyles).toMatch(/\.thread-review-panel\s*{[^}]*background:\s*var\(--surface-card-bg-subtle\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-panel > header\s*{[^}]*border-bottom:\s*1px solid var\(--surface-divider-faint\);[^}]*background:\s*var\(--surface-card-bg-strong\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-card\s*{[^}]*background:\s*var\(--surface-card-strong-subtle\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-card\.is-ready,\s*\.thread-review-card-emphasis\s*{[^}]*border-color:\s*var\(--surface-review-card-active-border\);[^}]*background:\s*var\(--surface-review-card-active-bg\);[^}]*box-shadow:\s*var\(--shadow-review-card-active\),\s*var\(--surface-card-shadow\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-card code\s*{[^}]*overflow-x:\s*hidden;[^}]*white-space:\s*normal;[^}]*overflow-wrap:\s*anywhere;[^}]*word-break:\s*break-word;/s);
    expect(sessionDetailStyles).toMatch(/\.detail-section\s*{[^}]*background:\s*var\(--surface-card-strong-subtle\);/s);
    expect(sessionDetailStyles).toMatch(/\.detail-section\[open\]\s*{[^}]*border-color:\s*var\(--surface-detail-section-open-border\);/s);
    expect(sessionDetailStyles).toMatch(/\.detail-section > summary\s*{[^}]*background:\s*var\(--surface-nav-subtle\);/s);
    expect(sessionDetailStyles).toMatch(/\.detail-section\[open\] > summary\s*{[^}]*border-bottom-color:\s*var\(--surface-detail-divider\);/s);
    expect(sessionDetailStyles).toMatch(/\.detail-section-static-head\s*{[^}]*background:\s*var\(--surface-nav-subtle\);/s);
    expect(sessionDetailStyles).toMatch(/\.detail-section-static-head\s*{[^}]*border-bottom:\s*1px solid var\(--surface-detail-divider\);/s);
    expect(sessionDetailStyles).toMatch(/\.detail-hero\s*{[^}]*background:\s*var\(--surface-card-strong-subtle\);/s);
    expect(sessionDetailStyles).toMatch(/\.detail-hero-pill\s*{[^}]*background:\s*var\(--surface-pill-ghost\);/s);
    expect(sessionDetailStyles).toMatch(/\.detail-hero-session-compact\s*{[^}]*background:\s*var\(--surface-card-strong-ghost\);/s);
    expect(sessionDetailStyles).toMatch(/\.session-detail-panel\s*{[^}]*background:\s*var\(--surface-card-bg-subtle\);/s);
    expect(sessionDetailStyles).toMatch(/\.session-detail-panel > header\s*{[^}]*border-bottom:\s*1px solid var\(--surface-divider-faint\);[^}]*background:\s*var\(--surface-card-bg-strong\);/s);
    expect(sessionDetailStyles).toMatch(/\.session-detail-panel \.transcript-summary-strip\s*{[^}]*border:\s*1px solid var\(--surface-detail-divider\);[^}]*background:\s*var\(--surface-nav-subtle\);/s);
    expect(sessionDetailStyles).toMatch(/\.session-detail-panel \.chat-log\s*{[^}]*background:\s*var\(--surface-detail-chat-log\);[^}]*border-color:\s*var\(--surface-detail-divider\);/s);
    expect(sessionDetailStyles).toMatch(/\.session-detail-panel \.detail-action-bar\s*{[^}]*border:\s*1px solid var\(--surface-detail-divider\);[^}]*background:\s*var\(--surface-detail-action-bar\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-panel \.detail-hero\s*{[^}]*background:\s*var\(--surface-card-strong-ghost\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-panel \.impact-body\s*{[^}]*overflow-y:\s*auto;[^}]*overflow-x:\s*hidden;[^}]*scroll-behavior:\s*smooth;/s);
    expect(sessionDetailStyles).toMatch(/\.thread-detail-empty-state\s*{[^}]*background:\s*var\(--surface-card-strong-subtle\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-detail-empty-next\s*{[^}]*border:\s*1px solid var\(--surface-detail-empty-border\);[^}]*background:\s*var\(--surface-nav-ghost\);/s);
    expect(sessionDetailStyles).toMatch(/\.session-detail-empty-next\s*{[^}]*border:\s*1px solid var\(--surface-card-border\);[^}]*border-radius:\s*var\(--radius-shell-md\);[^}]*background:\s*var\(--surface-card-strong-subtle\);/s);
    expect(sessionDetailStyles).toMatch(/\.session-detail-panel \.transcript-summary-strip\s*{[^}]*background:\s*var\(--surface-nav-subtle\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-panel \.transcript-search\s*{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-panel \.transcript-role-filter\s*{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
    expect(sessionDetailStyles).toMatch(/\.session-detail-panel \.transcript-search,\s*\.session-detail-panel \.transcript-role-filter\s*{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-panel \.transcript-summary-strip\s*{[^}]*border-color:\s*var\(--surface-border-ghost\);[^}]*background:\s*var\(--surface-nav-ghost\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-panel \.detail-action-bar\s*{[^}]*border-color:\s*var\(--surface-border-ghost\);[^}]*background:\s*var\(--surface-detail-action-bar-ghost\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-impact-summary,\s*\.thread-review-impact-note\s*{[^}]*overflow-wrap:\s*anywhere;[^}]*word-break:\s*break-word;/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-empty-guide article\s*{[^}]*border:\s*1px solid var\(--surface-detail-empty-border\);[^}]*background:\s*var\(--surface-nav-ghost\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-panel \.chat-log\s*{[^}]*border-color:\s*var\(--surface-detail-empty-border\);[^}]*background:\s*var\(--surface-card-bg-ghost\);/s);
    expect(sessionDetailStyles).toMatch(/\.impact-kv\s*{[^}]*background:\s*var\(--surface-impact-kv\);/s);
    expect(sessionDetailStyles).toMatch(/\.impact-list li\s*{[^}]*background:\s*var\(--surface-card-bg-ghost\);/s);
  });

  it("keeps detail section spacing on the approved design-system scale", () => {
    expect(sessionDetailStyles).toMatch(/\.detail-section > summary\s*{[^}]*padding:\s*11px 14px;/s);
    expect(sessionDetailStyles).toMatch(/\.detail-section-static-head\s*{[^}]*padding:\s*11px 14px;/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-panel \.detail-section > summary,\s*\.thread-review-panel \.detail-section-static-head\s*{[^}]*padding:\s*11px 14px;/s);
    expect(sessionDetailStyles).toMatch(/\.impact-body\s*{[^}]*padding:\s*16px 18px;[^}]*gap:\s*12px;/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-panel \.detail-hero\s*{[^}]*margin-bottom:\s*0;/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-panel \.detail-hero\s*{[^}]*padding:\s*11px 14px;/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-panel \.impact-body\s*{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-panel \.detail-section-body\s*{[^}]*padding:\s*12px 14px;[^}]*gap:\s*8px;/s);
    expect(sessionDetailStyles).toMatch(/\.detail-section-transcript\s*{[^}]*min-height:\s*0;/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-panel \.chat-log\s*{[^}]*max-height:\s*520px;[^}]*min-height:\s*0;[^}]*height:\s*auto;[^}]*flex:\s*0 0 auto;/s);
    expect(sessionDetailStyles).toMatch(/\.impact-list h3\s*{[^}]*margin:\s*10px 0 6px;[^}]*font-size:\s*var\(--text-md\);/s);
    expect(sessionDetailStyles).toMatch(/\.thread-detail-empty-state\s*{[^}]*gap:\s*12px;[^}]*padding:\s*12px 14px;/s);
    expect(sessionDetailStyles).toMatch(/\.thread-detail-empty-copy\s*{[^}]*gap:\s*5px;/s);
    expect(sessionDetailStyles).toMatch(/\.thread-detail-empty-next\s*{[^}]*gap:\s*5px;[^}]*padding:\s*10px 12px;/s);
    expect(sessionDetailStyles).not.toMatch(/\.thread-detail-empty-opens\s*{/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-empty-guide\s*{[^}]*gap:\s*7px;/s);
    expect(sessionDetailStyles).toMatch(/\.thread-review-empty-guide article\s*{[^}]*gap:\s*4px;[^}]*padding:\s*10px 11px;/s);
    expect(sessionDetailStyles).toMatch(/\.detail-hero-session-compact\s*{[^}]*gap:\s*8px;[^}]*padding:\s*11px 14px;/s);
  });

  it("keeps thread impact scoring rows on a three-column grid", () => {
    expect(sessionDetailStyles).toMatch(
      /\.thread-review-impact-evidence-body \.thread-review-impact-criteria-row\s*{[^}]*grid-template-columns:\s*minmax\(96px,\s*140px\) minmax\(0,\s*1fr\) auto;/s,
    );
    expect(sessionDetailStyles).toMatch(
      /\.thread-review-impact-criteria-row em\s*{[^}]*justify-self:\s*end;[^}]*min-width:\s*max-content;[^}]*white-space:\s*nowrap;/s,
    );
  });
});
