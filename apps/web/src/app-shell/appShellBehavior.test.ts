import { describe, expect, it } from "vitest";
import type { ProviderView } from "../types";
import {
  getFallbackProviderView,
  parseDesktopRouteSearch,
} from "./appShellBehavior";

const providerTabs: Array<{
  id: ProviderView;
  name: string;
}> = [
  { id: "all", name: "All" },
  { id: "claude", name: "Claude" },
  { id: "gemini", name: "Gemini" },
];

describe("appShellBehavior", () => {
  it("parses desktop route search params and normalizes legacy session paths", () => {
    expect(
      parseDesktopRouteSearch(
        "?view=providers&provider=claude&filePath=/tmp/.codex/sessions/demo.jsonl&threadId=abc",
      ),
    ).toEqual({
      view: "providers",
      provider: "claude",
      filePath: "/tmp/.codex-cli/sessions/demo.jsonl",
      threadId: "abc",
    });
  });

  it("drops invalid desktop route params", () => {
    expect(parseDesktopRouteSearch("?view=invalid&provider=nope")).toEqual({
      view: "",
      provider: "",
      filePath: "",
      threadId: "",
    });
  });

  it("returns a fallback provider only when the current provider disappears", () => {
    expect(getFallbackProviderView("claude", providerTabs, new Set(["claude", "gemini"]))).toBeNull();
    expect(getFallbackProviderView("claude", providerTabs, new Set(["gemini"]))).toBe("claude");
    expect(getFallbackProviderView("claude", providerTabs, new Set())).toBe("claude");
    expect(getFallbackProviderView("copilot", providerTabs, new Set(["gemini"]))).toBe("claude");
    expect(getFallbackProviderView("all", providerTabs, new Set(["gemini"]))).toBeNull();
  });
});
