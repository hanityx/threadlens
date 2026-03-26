import { describe, expect, it } from "vitest";
import { resolveHeaderSearchTarget } from "./appShellBehavior";
import type { ProviderSessionRow, ThreadRow } from "../types";

const providerRows: ProviderSessionRow[] = [
  {
    provider: "codex",
    source: "history",
    session_id: "019d0849-session-alpha",
    display_title: "Session alpha",
    file_path: "/tmp/codex/session-alpha.jsonl",
    size_bytes: 10,
    mtime: "2026-03-27T00:00:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: "Session alpha",
      title_source: "header",
    },
  },
  {
    provider: "claude",
    source: "history",
    session_id: "019d0849-session-beta",
    display_title: "Session beta",
    file_path: "/tmp/claude/session-beta.jsonl",
    size_bytes: 10,
    mtime: "2026-03-27T00:00:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: "Session beta",
      title_source: "header",
    },
  },
];

const threadRows: ThreadRow[] = [
  {
    thread_id: "thread-019d0849-alpha",
    title: "Alpha thread",
    source: "codex",
    risk_score: 0,
    is_pinned: false,
  },
];

describe("resolveHeaderSearchTarget", () => {
  it("opens a unique provider session prefix directly", () => {
    const target = resolveHeaderSearchTarget({
      query: "019d0849-session-a",
      visibleProviderIdSet: new Set(["all", "codex", "claude"]),
      providerSessionRows: providerRows,
      threadRows,
    });

    expect(target).toEqual({
      kind: "session",
      filePath: "/tmp/codex/session-alpha.jsonl",
      providerView: "codex",
    });
  });

  it("falls back to all when the matched provider tab is hidden", () => {
    const target = resolveHeaderSearchTarget({
      query: "019d0849-session-b",
      visibleProviderIdSet: new Set(["all", "codex"]),
      providerSessionRows: providerRows,
      threadRows,
    });

    expect(target).toEqual({
      kind: "session",
      filePath: "/tmp/claude/session-beta.jsonl",
      providerView: "all",
    });
  });

  it("opens a unique thread prefix directly", () => {
    const target = resolveHeaderSearchTarget({
      query: "thread-019d0849",
      visibleProviderIdSet: new Set(["all", "codex"]),
      providerSessionRows: providerRows,
      threadRows,
    });

    expect(target).toEqual({
      kind: "thread",
      threadId: "thread-019d0849-alpha",
    });
  });

  it("falls back to search when a prefix is ambiguous", () => {
    const target = resolveHeaderSearchTarget({
      query: "019d0849",
      visibleProviderIdSet: new Set(["all", "codex", "claude"]),
      providerSessionRows: providerRows,
      threadRows,
    });

    expect(target).toBeNull();
  });
});
