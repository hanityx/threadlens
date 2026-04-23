import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SESSION_DETAIL_CSS = readFileSync(
  new URL("../../../shared/ui/styles/session-detail.css", import.meta.url),
  "utf8",
);

describe("ForensicsPanel styles", () => {
  it("aligns scoring details summary marker and text on the same row", () => {
    expect(SESSION_DETAIL_CSS).toContain(".thread-review-impact-evidence-details > summary {");
    expect(SESSION_DETAIL_CSS).toContain("display: flex;");
    expect(SESSION_DETAIL_CSS).toContain("align-items: center;");
    expect(SESSION_DETAIL_CSS).toContain(
      ".thread-review-impact-evidence-details > summary::-webkit-details-marker {",
    );
    expect(SESSION_DETAIL_CSS).toContain(
      ".thread-review-impact-evidence-details[open] > summary::before {",
    );
  });

  it("keeps the closed scoring details summary vertically centered inside its shell", () => {
    expect(SESSION_DETAIL_CSS).toContain(".thread-review-impact-evidence-details:not([open]) {");
    expect(SESSION_DETAIL_CSS).toContain("display: flex;");
    expect(SESSION_DETAIL_CSS).toContain("align-items: center;");
    expect(SESSION_DETAIL_CSS).toContain("min-height: 44px;");
    expect(SESSION_DETAIL_CSS).toContain("padding: 0 12px;");
  });
});
