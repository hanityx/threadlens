import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  compactWorkbenchId,
  formatWorkbenchGroupLabel,
  formatWorkbenchRailDay,
  formatWorkbenchRailTime,
  normalizeWorkbenchTitle,
  providerFromSourceKey,
} from "./workbenchFormat";
import { normalizeDesktopRouteFilePath } from "./desktopRoute";

const hiddenWorktreeDir = `.${["work", "trees"].join("")}`;
const homeSegments = (...parts: string[]) => ["", "home", "example", ...parts].join("/");

describe("workbench helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-24T12:00:00+09:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps provider ids from source keys", () => {
    expect(providerFromSourceKey("claude_project")).toBe("claude");
    expect(providerFromSourceKey("gemini_archive")).toBe("gemini");
    expect(providerFromSourceKey("copilot_workspace")).toBe("copilot");
    expect(providerFromSourceKey("chat_sessions")).toBe("chatgpt");
    expect(providerFromSourceKey("global_state")).toBe("codex");
    expect(providerFromSourceKey("unknown_source")).toBeNull();
  });

  it("compacts long ids while preserving short ids", () => {
    expect(compactWorkbenchId("", "thread")).toBe("thread");
    expect(compactWorkbenchId("thread-1234", "thread")).toBe("thread 1234");
    expect(compactWorkbenchId("2026-03-24-rollout-session-alpha", "session")).toBe("session on-alpha");
    expect(compactWorkbenchId("abcdef1234567890abcdef", "thread")).toBe("thread abcdef12");
  });

  it("normalizes generated or missing titles", () => {
    expect(normalizeWorkbenchTitle("", "Fallback")).toBe("Fallback");
    expect(normalizeWorkbenchTitle("none", "Fallback")).toBe("Fallback");
    expect(
      normalizeWorkbenchTitle("550e8400-e29b-41d4-a716-446655440000", "Fallback"),
    ).toBe("Fallback");
    expect(normalizeWorkbenchTitle("Actual title", "Fallback")).toBe("Actual title");
    expect(
      normalizeWorkbenchTitle(
        `Continue from \`${homeSegments(hiddenWorktreeDir, "local-sandbox-20260320")}\``,
        "Fallback",
      ),
    ).toBe("Continue from local workspace");
    expect(
      normalizeWorkbenchTitle(
        "local workspace local-sandbox-20260320/docs/HANDOFF_INDEX_2026-03-20.md",
        "Fallback",
      ),
    ).toBe("local workspace");
    expect(
      normalizeWorkbenchTitle(
        homeSegments("project", "docs", "HANDOFF_INDEX_2026-03-20.md"),
        "Fallback",
      ),
    ).toBe("local workspace");
  });

  it("formats workbench day and time labels", () => {
    expect(formatWorkbenchRailDay("2026-03-24T09:30:00+09:00")).toBe("Today");
    expect(formatWorkbenchRailDay("2026-03-23T23:30:00+09:00")).toBe("Yesterday");
    expect(formatWorkbenchRailDay("2026-03-20T09:30:00+09:00")).toBe("Mar 20");

    expect(formatWorkbenchRailTime("2026-03-24T09:30:00+09:00")).toBe(
      new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(
        new Date("2026-03-24T09:30:00+09:00"),
      ),
    );
    expect(formatWorkbenchRailTime("bad-time")).toBe("--:--");
  });

  it("formats grouped rail labels in uppercase", () => {
    expect(formatWorkbenchGroupLabel("2026-03-24T09:30:00+09:00")).toBe("Today");
    expect(formatWorkbenchGroupLabel("2026-03-23T09:30:00+09:00")).toBe("Yesterday");
    expect(formatWorkbenchGroupLabel("2026-03-20T09:30:00+09:00")).toBe("MAR 20");
  });

  it("normalizes desktop route file paths for codex-cli mirror roots", () => {
    const legacyRoutePath = homeSegments(".codex", "sessions", "2026", "03", "thread.jsonl");
    const cliRoutePath = homeSegments(".codex-cli", "sessions", "2026", "03", "thread.jsonl");
    expect(normalizeDesktopRouteFilePath("")).toBe("");
    expect(normalizeDesktopRouteFilePath(legacyRoutePath)).toBe(cliRoutePath);
    expect(normalizeDesktopRouteFilePath("/tmp/session.jsonl")).toBe("/tmp/session.jsonl");
  });
});
