import { describe, expect, it } from "vitest";
import {
  clampSlowProviderThresholdMs,
  resolveInitialLayoutView,
  resolveInitialProviderView,
} from "@/shared/hooks/usePreferences";

describe("usePreferences route-aware initializers", () => {
  it("prefers a valid layout from the URL over stored layout state", () => {
    expect(resolveInitialLayoutView("overview", "?view=providers&provider=copilot")).toBe("providers");
  });

  it("falls back to stored layout when the URL view is absent or invalid", () => {
    expect(resolveInitialLayoutView("threads", "")).toBe("threads");
    expect(resolveInitialLayoutView("search", "?view=invalid")).toBe("search");
  });

  it("prefers a valid provider from a providers deep-link over stored provider state", () => {
    expect(resolveInitialProviderView("all", "?view=providers&provider=copilot")).toBe("copilot");
  });

  it("ignores provider query params outside the providers surface", () => {
    expect(resolveInitialProviderView("claude", "?view=search&provider=copilot")).toBe("claude");
  });

  it("falls back to all when stored provider is missing or invalid", () => {
    expect(resolveInitialProviderView(null, "")).toBe("all");
    expect(resolveInitialProviderView("unknown", "")).toBe("all");
  });

  it("clamps slow-provider threshold values to the supported range", () => {
    expect(clampSlowProviderThresholdMs(400)).toBe(800);
    expect(clampSlowProviderThresholdMs(1200)).toBe(1200);
    expect(clampSlowProviderThresholdMs(9999)).toBe(6000);
  });
});
