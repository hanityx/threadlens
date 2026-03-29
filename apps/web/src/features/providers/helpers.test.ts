import { describe, expect, it, vi } from "vitest";
import {
  compactSessionFileName,
  compactSessionId,
  compactSessionTitle,
  csvCell,
  dataSourceLabel,
  formatBytes,
  formatFetchMs,
  providerFromDataSource,
  suppressMouseFocus,
} from "./helpers";

describe("provider helpers", () => {
  it("escapes csv cells that contain quotes, commas, or newlines", () => {
    expect(csvCell("alpha")).toBe("alpha");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });

  it("formats byte counts and fetch timings for compact provider surfaces", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1024 * 12)).toBe("12 MB");
    expect(formatFetchMs(null)).toBe("-");
    expect(formatFetchMs(12.7)).toBe("13ms");
  });

  it("compacts generated titles and long session ids", () => {
    expect(compactSessionTitle("", "2026-03-24-session-abcdef12")).toBe("session abcdef12");
    expect(compactSessionTitle("rollout-2026-03-24-something", "abcd1234")).toBe("session abcd1234");
    expect(compactSessionTitle("Review instructions.md", "abcd1234")).toBe("session abcd1234");
    expect(compactSessionTitle("Clean title", "abcd1234")).toBe("Clean title");
    expect(compactSessionId("1234567890abcdefghijkl")).toBe("12345678…ijkl");
    expect(compactSessionId("short-id")).toBe("short-id");
    expect(compactSessionFileName("rollout-2026-03-29T03-15-34-session-notes.jsonl")).toBe(
      "rollout-2026-03-29T03-15…notes.jsonl",
    );
    expect(compactSessionFileName("session.jsonl")).toBe("session.jsonl");
  });

  it("maps provider data sources and readable labels", () => {
    expect(providerFromDataSource("claude_projects")).toBe("claude");
    expect(providerFromDataSource("chat_exports")).toBe("chatgpt");
    expect(providerFromDataSource("copilot_cursor")).toBe("copilot");
    expect(providerFromDataSource("unknown_source")).toBeNull();
    expect(dataSourceLabel("global_state")).toBe("Global state");
    expect(dataSourceLabel("copilot_cursor_workspace")).toBe("Copilot Cursor workspace");
    expect(dataSourceLabel("custom_source_key")).toBe("Custom Source Key");
  });

  it("suppresses mouse focus without blocking keyboard-triggered activation", () => {
    const mousePreventDefault = vi.fn();
    suppressMouseFocus({ detail: 1, preventDefault: mousePreventDefault });
    expect(mousePreventDefault).toHaveBeenCalledTimes(1);

    const keyboardPreventDefault = vi.fn();
    suppressMouseFocus({ detail: 0, preventDefault: keyboardPreventDefault });
    expect(keyboardPreventDefault).not.toHaveBeenCalled();
  });
});
