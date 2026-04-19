import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CSV_COLUMNS,
  clearSlowOnlyPref,
  compactSessionFileName,
  compactSessionId,
  compactSessionTitle,
  csvCell,
  dataSourceLabel,
  formatFetchMs,
  providerFromDataSource,
  readCsvColumnPrefs,
  suppressMouseFocus,
  writeCsvColumnPrefs,
} from "@/features/providers/lib/helpers";

describe("provider helpers", () => {
  it("escapes csv cells that contain quotes, commas, or newlines", () => {
    expect(csvCell("alpha")).toBe("alpha");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });

  it("formats fetch timings for compact provider surfaces", () => {
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

  it("returns default csv prefs when localStorage reads throw", () => {
    const getItem = vi.fn(() => {
      throw new Error("blocked");
    });
    vi.stubGlobal("window", {
      localStorage: { getItem },
    });

    expect(readCsvColumnPrefs()).toEqual(DEFAULT_CSV_COLUMNS);
  });

  it("swallows provider storage write and remove failures", () => {
    const setItem = vi.fn(() => {
      throw new Error("blocked");
    });
    const removeItem = vi.fn(() => {
      throw new Error("blocked");
    });
    vi.stubGlobal("window", {
      localStorage: { setItem, removeItem },
    });

    expect(() =>
      writeCsvColumnPrefs({
        provider: true,
        session_id: true,
        title: true,
        title_source: true,
        source: true,
        format: true,
        probe_ok: true,
        size_bytes: true,
        modified: true,
        file_path: true,
      }),
    ).not.toThrow();
    expect(() => clearSlowOnlyPref()).not.toThrow();
  });
});
