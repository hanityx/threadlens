import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const resetStyles = readFileSync(new URL("../reset.css", import.meta.url), "utf8");

describe("reset token migration", () => {
  it("uses typography tokens for base body copy", () => {
    expect(resetStyles).toMatch(/body\s*{[^}]*font-size:\s*var\(--text-body-base\);/s);
  });
});
