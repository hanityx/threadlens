import { describe, expect, it, vi } from "vitest";
import type { ProviderSessionRow, ThreadRow } from "@/shared/types";
import {
  buildFallbackSessionRow,
  buildRefreshAllDataJobs,
  buildProviderById,
  computeLayoutFlags,
  selectImpactRows,
  selectSessionByPath,
  selectThreadById,
  shouldRefreshExecutionGraph,
  shouldRefreshProvidersAfterGlobalRefresh,
} from "@/app/hooks/useAppData";

function buildSession(filePath: string): ProviderSessionRow {
  return {
    provider: "codex",
    source: "sessions",
    session_id: `session-${filePath}`,
    display_title: filePath,
    file_path: filePath,
    size_bytes: 1024,
    mtime: "2026-04-20T00:00:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: filePath,
      title_source: "header",
    },
  };
}

function buildThread(threadId: string): ThreadRow {
  return {
    thread_id: threadId,
    title: `Thread ${threadId}`,
    risk_score: 42,
    is_pinned: false,
    source: "codex",
  };
}

describe("useAppData helpers", () => {
  it("selects session and thread records from current ids", () => {
    expect(
      selectSessionByPath([buildSession("/tmp/a.jsonl")], "/tmp/a.jsonl", "codex")?.session_id,
    ).toContain("/tmp/a.jsonl");
    expect(selectSessionByPath([buildSession("/tmp/a.jsonl")], "/tmp/missing.jsonl", "all")).toBeNull();
    expect(selectThreadById([buildThread("thread-1")], "thread-1")?.thread_id).toBe("thread-1");
    expect(selectThreadById([buildThread("thread-1")], "thread-2")).toBeNull();
  });

  it("builds a fallback selected session for routed provider detail paths", () => {
    const fallback = selectSessionByPath([], "/Users/example/.gemini/tmp/chat/session-123.json", "gemini");

    expect(fallback).toEqual(
      buildFallbackSessionRow("/Users/example/.gemini/tmp/chat/session-123.json", "gemini"),
    );
    expect(fallback?.probe.ok).toBe(false);
    expect(fallback?.probe.format).toBe("json");
  });

  it("builds provider capability maps and layout flags from current view", () => {
    const providerById = buildProviderById([
      { provider: "codex", capabilities: { safe_cleanup: true } },
      { provider: "claude", capabilities: { safe_cleanup: false } },
    ]);

    expect(providerById.get("codex")?.capabilities?.safe_cleanup).toBe(true);
    expect(providerById.get("claude")?.capabilities?.safe_cleanup).toBe(false);

    expect(computeLayoutFlags("providers")).toEqual({
      showProviders: true,
      showThreadsTable: false,
      showForensics: false,
      showRouting: true,
      showDetails: true,
    });
    expect(computeLayoutFlags("threads")).toEqual({
      showProviders: false,
      showThreadsTable: true,
      showForensics: true,
      showRouting: false,
      showDetails: true,
    });
    expect(computeLayoutFlags("overview")).toEqual({
      showProviders: false,
      showThreadsTable: false,
      showForensics: false,
      showRouting: false,
      showDetails: false,
    });
  });

  it("filters analysis rows by selected ids only", () => {
    expect(
      selectImpactRows(["thread-1", "thread-3"], [
        { id: "thread-1" },
        { id: "thread-2" },
        { id: "thread-3" },
      ]),
    ).toEqual([{ id: "thread-1" }, { id: "thread-3" }]);
    expect(selectImpactRows([], [{ id: "thread-1" }])).toEqual([]);
  });

  it("derives global refresh scope from the current layout", async () => {
    expect(shouldRefreshExecutionGraph("providers")).toBe(true);
    expect(shouldRefreshExecutionGraph("threads")).toBe(false);
    expect(shouldRefreshProvidersAfterGlobalRefresh("providers")).toBe(true);
    expect(shouldRefreshProvidersAfterGlobalRefresh("overview")).toBe(true);
    expect(shouldRefreshProvidersAfterGlobalRefresh("threads")).toBe(false);

    const runtime = { refetch: vi.fn().mockResolvedValue("runtime") };
    const threads = { refetch: vi.fn().mockResolvedValue("threads") };
    const smokeStatus = { refetch: vi.fn().mockResolvedValue("smoke") };
    const recovery = { refetch: vi.fn().mockResolvedValue("recovery") };
    const executionGraph = { refetch: vi.fn().mockResolvedValue("graph") };

    const providerJobs = buildRefreshAllDataJobs("providers", {
      runtime,
      threads,
      smokeStatus,
      recovery,
      executionGraph,
    });
    await expect(Promise.all(providerJobs)).resolves.toEqual([
      "runtime",
      "threads",
      "smoke",
      "recovery",
      "graph",
    ]);
    expect(executionGraph.refetch).toHaveBeenCalledWith({ cancelRefetch: false });

    const threadJobs = buildRefreshAllDataJobs("threads", {
      runtime,
      threads,
      smokeStatus,
      recovery,
      executionGraph,
    });
    await expect(Promise.all(threadJobs)).resolves.toEqual([
      "runtime",
      "threads",
      "smoke",
      "recovery",
    ]);
  });
});
