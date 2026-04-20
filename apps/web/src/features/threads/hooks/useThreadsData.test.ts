import { describe, expect, it } from "vitest";
import type { ThreadRow } from "@/shared/types";
import { PAGE_SIZE } from "@/shared/types";
import { THREADS_FAST_BOOT_LIMIT } from "@/shared/lib/appState";
import {
  filterThreadRows,
  pruneSelectedThreads,
  resolveAllFilteredSelected,
  resolveThreadsLoadingState,
  resolveThreadsQueryLimit,
  restoreThreadsBootstrapRows,
} from "@/features/threads/hooks/useThreadsData";

function buildThread(overrides: Partial<ThreadRow> = {}): ThreadRow {
  return {
    thread_id: "thread-1",
    title: "Cleanup thread",
    risk_score: 42,
    is_pinned: false,
    source: "codex",
    ...overrides,
  };
}

describe("useThreadsData helpers", () => {
  it("restores bootstrap rows from cached JSON and ignores malformed payloads", () => {
    const rows = restoreThreadsBootstrapRows(
      JSON.stringify({
        rows: [
          { thread_id: "thread-1", title: "First", risk_score: 12, is_pinned: false, source: "codex" },
          { thread_id: "thread-2", title: "Second", risk_score: 88, is_pinned: true, source: "claude" },
        ],
      }),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.thread_id).toBe("thread-1");
    expect(restoreThreadsBootstrapRows("{bad-json")).toEqual([]);
    expect(restoreThreadsBootstrapRows(null)).toEqual([]);
  });

  it("uses fast boot limits only while the threads layout is warming up", () => {
    expect(resolveThreadsQueryLimit("threads", true)).toBe(THREADS_FAST_BOOT_LIMIT);
    expect(resolveThreadsQueryLimit("threads", false)).toBe(PAGE_SIZE);
    expect(resolveThreadsQueryLimit("overview", true)).toBe(60);
  });

  it("filters thread rows by query, high-risk, and pinned modes", () => {
    const rows = [
      buildThread({ thread_id: "thread-1", title: "Cleanup queue", risk_score: 40, is_pinned: false }),
      buildThread({ thread_id: "thread-2", title: "Pinned archive", risk_score: 90, is_pinned: true }),
      buildThread({ thread_id: "thread-3", title: "Low risk", risk_score: 20, is_pinned: false }),
    ];

    expect(filterThreadRows(rows, "cleanup", "all").map((row) => row.thread_id)).toEqual(["thread-1"]);
    expect(filterThreadRows(rows, "", "high-risk").map((row) => row.thread_id)).toEqual(["thread-2"]);
    expect(filterThreadRows(rows, "", "pinned").map((row) => row.thread_id)).toEqual(["thread-2"]);
  });

  it("prunes stale selected ids and keeps stable maps when nothing changes", () => {
    const selected = { "thread-1": true, "thread-2": false, "thread-3": true };
    expect(
      pruneSelectedThreads(selected, new Set(["thread-1", "thread-4"])),
    ).toEqual({ "thread-1": true });

    const unchanged = { "thread-1": true };
    expect(
      pruneSelectedThreads(unchanged, new Set(["thread-1", "thread-2"])),
    ).toBe(unchanged);
  });

  it("derives selected state and loading flags from visible thread state", () => {
    expect(
      resolveAllFilteredSelected(
        [{ thread_id: "thread-1" }, { thread_id: "thread-2" }],
        ["thread-1", "thread-2"],
      ),
    ).toBe(true);
    expect(
      resolveAllFilteredSelected(
        [{ thread_id: "thread-1" }, { thread_id: "thread-2" }],
        ["thread-1"],
      ),
    ).toBe(false);
    expect(resolveAllFilteredSelected([], ["thread-1"])).toBe(false);

    expect(resolveThreadsLoadingState(true, 0, true, true, false)).toEqual({
      threadsLoading: true,
      threadsFastBooting: true,
    });
    expect(resolveThreadsLoadingState(false, 10, true, false, true)).toEqual({
      threadsLoading: false,
      threadsFastBooting: false,
    });
  });
});
