import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const densityStyles = readFileSync(new URL("../density.css", import.meta.url), "utf8");

describe("density token migration", () => {
  it("uses typography tokens for compact density overrides", () => {
    expect(densityStyles).toMatch(/:root\[data-density="compact"\] body\s*{[^}]*font-size:\s*var\(--text-body-compact\);/s);
    expect(densityStyles).toMatch(/:root\[data-density="compact"\] \.meta-chip\s*{[^}]*font-size:\s*var\(--text-base\);/s);
    expect(densityStyles).toMatch(/:root\[data-density="compact"\] \.kpi-value\s*{[^}]*font-size:\s*var\(--text-2xl\);/s);
    expect(densityStyles).toMatch(/:root\[data-density="compact"\] th,\s*:root\[data-density="compact"\] td\s*{[^}]*font-size:\s*var\(--text-md\);/s);
    expect(densityStyles).toMatch(/:root\[data-density="compact"\] \.provider-roots > summary\s*{[^}]*font-size:\s*var\(--text-sm\);/s);
    expect(densityStyles).toMatch(/:root\[data-density="compact"\] \.detail-section > summary\s*{[^}]*font-size:\s*var\(--text-base\);/s);
  });
});
