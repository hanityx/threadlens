import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const OPS_CSS = readFileSync(new URL("../styles/ops.css", import.meta.url), "utf8");

describe("shared ops styles", () => {
  it("owns the split workbench layout shell", () => {
    expect(OPS_CSS).toMatch(/\.ops-layout\s*{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(420px,\s*1\.12fr\);/s);
    expect(OPS_CSS).toMatch(/\.ops-layout\.single\s*{[^}]*grid-template-columns:\s*1fr;/s);
  });

  it("keeps segmented action tools shared between threads and sessions", () => {
    expect(OPS_CSS).toMatch(/\.sessions-action-tools\s*{[^}]*display:\s*inline-flex;[^}]*border:\s*1px solid var\(--surface-border-ghost\);/s);
    expect(OPS_CSS).toMatch(/\.sessions-action-tool-btn\s*{[^}]*min-height:\s*32px;[^}]*background:\s*transparent;[^}]*font-size:\s*var\(--text-xs\);/s);
    expect(OPS_CSS).toMatch(/\.sessions-action-tool-btn:hover:not\(:disabled\),\s*\.sessions-action-tool-btn:focus-visible,\s*\.sessions-action-tool-btn\.is-active\s*{[^}]*background:\s*var\(--surface-panel-subtle-soft\);/s);
  });
});
