import { describe, expect, it } from "vitest";
import {
  clampLayoutScrollTarget,
  resolveHeaderSearchSeed,
  shouldCaptureLayoutScroll,
} from "@/app/hooks/useAppShellState";

describe("useAppShellState helpers", () => {
  it("captures layout scroll only when the view actually changes in the browser", () => {
    expect(shouldCaptureLayoutScroll("overview", "overview", true)).toBe(false);
    expect(shouldCaptureLayoutScroll("threads", "overview", false)).toBe(false);
    expect(shouldCaptureLayoutScroll("threads", "overview", true)).toBe(true);
  });

  it("clamps restored scroll positions to the current document height", () => {
    expect(clampLayoutScrollTarget(800, 3000, 1000)).toBe(800);
    expect(clampLayoutScrollTarget(2800, 3000, 1000)).toBe(2000);
    expect(clampLayoutScrollTarget(200, 600, 1000)).toBe(0);
  });

  it("does not hydrate stale search text into the Search tab", () => {
    expect(resolveHeaderSearchSeed("cleanup")).toBe("");
    expect(resolveHeaderSearchSeed(null)).toBe("");
  });
});
