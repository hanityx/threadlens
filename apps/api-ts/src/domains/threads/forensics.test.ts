import { describe, expect, it } from "vitest";
import { getThreadForensicsTs } from "./forensics.js";

describe("thread forensics", () => {
  it("returns empty forensics payload for empty selection", async () => {
    const data = await getThreadForensicsTs([]);
    expect(data.count).toBe(0);
    expect(Array.isArray(data.reports)).toBe(true);
    expect(data.reports).toHaveLength(0);
  });
});
