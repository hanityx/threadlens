import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routingStyles = readFileSync(new URL("./routing.css", import.meta.url), "utf8");

describe("routing layout polish", () => {
  it("adds grouped diagnostics cards for paths and findings", () => {
    expect(routingStyles).toMatch(
      /\.routing-signal-grid\s*{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(320px,\s*1fr\)\);/s,
    );
    expect(routingStyles).toMatch(
      /\.routing-list-card\s*{[^}]*border:\s*1px solid var\(--surface-card-border\);[^}]*background:\s*var\(--surface-card-bg-subtle\);/s,
    );
    expect(routingStyles).toMatch(
      /\.routing-list-card\.is-primary\s*{[^}]*background:\s*var\(--surface-card-strong-subtle\);/s,
    );
  });

  it("lets diagnostics rows wrap instead of clipping path and findings text", () => {
    expect(routingStyles).toMatch(
      /\.routing-workbench-panel \.impact-list li\s*{[^}]*display:\s*grid;[^}]*align-items:\s*flex-start;/s,
    );
    expect(routingStyles).toMatch(
      /\.routing-workbench-panel \.impact-list li > span,\s*\.routing-workbench-panel \.impact-list li > \.mono-sub\s*{[^}]*max-width:\s*none;[^}]*white-space:\s*normal;/s,
    );
    expect(routingStyles).toMatch(
      /\.routing-workbench-panel \.impact-kv\s*{[^}]*grid-template-columns:\s*minmax\(96px,\s*140px\)\s*minmax\(0,\s*1fr\);/s,
    );
  });

  it("uses calmer title-case helper labels instead of dense uppercase chrome", () => {
    expect(routingStyles).toMatch(
      /\.routing-list-card-head span\s*{[^}]*font-size:\s*var\(--text-xs\);[^}]*text-transform:\s*none;/s,
    );
    expect(routingStyles).toMatch(
      /\.routing-stage-summary-card span\s*{[^}]*font-size:\s*var\(--text-xs\);[^}]*text-transform:\s*none;/s,
    );
  });

  it("keeps long diagnostics node labels and paths inside their cards", () => {
    expect(routingStyles).toMatch(
      /\.routing-node-top strong\s*{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere;/s,
    );
    expect(routingStyles).toMatch(
      /\.routing-workbench-panel \.routing-node-grid-flow \.sub-hint\s*{[^}]*overflow-wrap:\s*anywhere;[^}]*word-break:\s*break-word;/s,
    );
  });
});
