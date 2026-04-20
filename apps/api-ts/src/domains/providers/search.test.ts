import { SEARCHABLE_PROVIDER_IDS } from "@threadlens/shared-contracts";
import { describe, expect, it, vi } from "vitest";
import type {
  ProviderSessionRow,
  TranscriptPayload,
} from "../../lib/providers.js";
import {
  buildConversationSearchProviderBudgets,
  createCachedConversationTranscriptLoader,
  defaultConversationSearchProviders,
  isMetadataOnlyConversationQuery,
  resolveConversationSearchLimits,
  searchConversationRows,
} from "./search.js";

function makeRow(overrides: Partial<ProviderSessionRow> = {}): ProviderSessionRow {
  return {
    provider: "codex",
    source: "sessions",
    session_id: "rollout-2026-03-25T10-00-00-019d-search-test",
    display_title: "Search fixture",
    file_path: "/tmp/search-fixture.jsonl",
    size_bytes: 128,
    mtime: "2026-03-25T10:00:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: "Search fixture",
      title_source: "fixture",
    },
    ...overrides,
  };
}

function makeTranscript(
  row: ProviderSessionRow,
  messages: TranscriptPayload["messages"],
): TranscriptPayload {
  return {
    provider: row.provider,
    thread_id: "019d-search-test-thread",
    file_path: row.file_path,
    scanned_lines: messages.length,
    message_count: messages.length,
    truncated: false,
    messages,
  };
}

describe("searchConversationRows", () => {
  it("returns metadata matches without loading transcripts when the limit is satisfied", async () => {
    const row = makeRow({
      display_title: "Unrelated title",
      session_id: "rollout-2026-03-25T10-00-00-019d-chatgpt-scope",
      file_path: "/tmp/chatgpt-scope.jsonl",
    });
    const transcriptLoader = vi.fn(async () =>
      makeTranscript(row, [
        {
          idx: 0,
          role: "assistant",
          text: "chatgpt only in transcript",
          ts: "2026-03-25T10:00:00.000Z",
          source_type: "response_item.message",
        },
      ]),
    );

    const result = await searchConversationRows([row], "chatgpt", {
      limit: 1,
      transcriptLoader,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      match_kind: "title",
      session_id: "chatgpt-scope",
    });
    expect(transcriptLoader).not.toHaveBeenCalled();
  });

  it("stops before loading later transcripts once metadata hits fill the result limit", async () => {
    const metadataRow = makeRow({
      display_title: "Unrelated title",
      session_id: "rollout-2026-03-25T10-00-00-019d-obsidian-review",
      file_path: "/tmp/obsidian-review.jsonl",
      mtime: "2026-03-25T10:05:00.000Z",
    });
    const transcriptRow = makeRow({
      display_title: "Another unrelated title",
      session_id: "rollout-2026-03-25T10-00-00-019d-transcript-only",
      file_path: "/tmp/transcript-only.jsonl",
      mtime: "2026-03-25T10:00:00.000Z",
    });
    const transcriptLoader = vi.fn(async (_provider, filePath) =>
      makeTranscript(
        filePath === metadataRow.file_path ? metadataRow : transcriptRow,
        [
          {
            idx: 0,
            role: "assistant",
            text: "obsidian transcript fallback",
            ts: "2026-03-25T10:00:00.000Z",
            source_type: "response_item.message",
          },
        ],
      ),
    );

    const result = await searchConversationRows(
      [metadataRow, transcriptRow],
      "obsidian",
      {
        limit: 1,
        transcriptLoader,
      },
    );

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      match_kind: "title",
      session_id: "obsidian-review",
    });
    expect(transcriptLoader).not.toHaveBeenCalled();
  });

  it("suppresses exact duplicate message hits within the same session", async () => {
    const row = makeRow({
      display_title: "Unrelated title",
      file_path: "/tmp/search-dedup-case.jsonl",
    });
    const transcriptLoader = vi.fn(async () =>
      makeTranscript(row, [
        {
          idx: 0,
          role: "user",
          text: "agent duplicate result",
          ts: "2026-03-25T10:00:00.000Z",
          source_type: "response_item.message",
        },
        {
          idx: 1,
          role: "user",
          text: "agent duplicate result",
          ts: "2026-03-25T10:00:01.000Z",
          source_type: "event_msg.user_message",
        },
      ]),
    );

    const result = await searchConversationRows([row], "agent", {
      limit: 40,
      transcriptLoader,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      match_kind: "message",
      role: "user",
    });
  });

  it("falls back to transcript scanning when metadata matches are insufficient", async () => {
    const row = makeRow({
      display_title: "Unrelated title",
      file_path: "/tmp/search-transcript-case.jsonl",
    });
    const transcriptLoader = vi.fn(async () =>
      makeTranscript(row, [
        {
          idx: 0,
          role: "assistant",
          text: "search fallback hit",
          ts: "2026-03-25T10:00:00.000Z",
          source_type: "response_item.message",
        },
      ]),
    );

    const result = await searchConversationRows([row], "fallback", {
      limit: 5,
      transcriptLoader,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      match_kind: "message",
      role: "assistant",
    });
    expect(transcriptLoader).toHaveBeenCalledTimes(1);
  });

  it("skips transcript scanning entirely for metadata-only queries", async () => {
    const row = makeRow({
      display_title: "Unrelated title",
      session_id: "rollout-2026-03-25T10-00-00-019d-rollout-query",
      file_path: "/tmp/rollout-2026-03-25T10-00-00-019d-rollout-query.jsonl",
    });
    const transcriptLoader = vi.fn(async () =>
      makeTranscript(row, [
        {
          idx: 0,
          role: "assistant",
          text: "rollout token only in transcript",
          ts: "2026-03-25T10:00:00.000Z",
          source_type: "response_item.message",
        },
      ]),
    );

    const result = await searchConversationRows([row], "rollout-2026-03-25", {
      limit: 10,
      transcriptLoader,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      match_kind: "title",
      session_id: "rollout-2026-03-25T10-00-00-019d-rollout-query",
    });
    expect(transcriptLoader).not.toHaveBeenCalled();
  });

  it("omits cleanup thread ids that are not openable in the current thread read model", async () => {
    const row = makeRow({
      session_id: "rollout-2026-03-29T01-53-21-019d355d-51c3-7753-b2f2-8db585337e41",
      file_path:
        "/tmp/rollout-2026-03-29T01-53-21-019d355d-51c3-7753-b2f2-8db585337e41.jsonl",
      display_title: "ThreadLens handoff",
    });

    const result = await searchConversationRows([row], "handoff", {
      limit: 10,
      openableThreadIds: new Set(),
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      provider: "codex",
      session_id: "rollout-2026-03-29T01-53-21-019d355d-51c3-7753-b2f2-8db585337e41",
      match_kind: "title",
    });
    expect(result.results[0].thread_id).toBeUndefined();
  });

  it("keeps cleanup thread ids when they are openable in the current thread read model", async () => {
    const threadId = "019d355d-51c3-7753-b2f2-8db585337e41";
    const row = makeRow({
      session_id: `rollout-2026-03-29T01-53-21-${threadId}`,
      file_path: `/tmp/rollout-2026-03-29T01-53-21-${threadId}.jsonl`,
      display_title: "ThreadLens handoff",
    });

    const result = await searchConversationRows([row], "handoff", {
      limit: 10,
      openableThreadIds: new Set([threadId]),
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      provider: "codex",
      thread_id: threadId,
      match_kind: "title",
    });
  });
});

describe("createCachedConversationTranscriptLoader", () => {
  it("reuses transcripts while file mtime is unchanged", async () => {
    const row = makeRow({
      file_path: "/tmp/search-cache-fixture.jsonl",
      mtime: "2026-03-25T10:10:00.000Z",
    });
    const baseLoader = vi.fn(async () =>
      makeTranscript(row, [
        {
          idx: 0,
          role: "assistant",
          text: "agent cache check",
          ts: "2026-03-25T10:00:00.000Z",
          source_type: "response_item.message",
        },
      ]),
    );
    const cachedLoader = createCachedConversationTranscriptLoader(baseLoader);

    await cachedLoader(row);
    await cachedLoader(row);
    await cachedLoader({ ...row, mtime: "2026-03-25T10:00:05.000Z" });

    expect(baseLoader).toHaveBeenCalledTimes(2);
  });

  it("retries after a transient transcript load failure when mtime is unchanged", async () => {
    const row = makeRow({
      file_path: "/tmp/search-cache-transient-error.jsonl",
      mtime: "2026-03-25T10:10:00.000Z",
    });
    let shouldFail = true;
    const baseLoader = vi.fn(async () => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("transient transcript failure");
      }
      return makeTranscript(row, [
        {
          idx: 0,
          role: "assistant",
          text: "recovered transcript",
          ts: "2026-03-25T10:00:00.000Z",
          source_type: "response_item.message",
        },
      ]);
    });
    const cachedLoader = createCachedConversationTranscriptLoader(baseLoader);

    const first = await cachedLoader(row);
    const second = await cachedLoader(row);

    expect(first).toBeNull();
    expect(second?.messages[0]?.text).toBe("recovered transcript");
    expect(baseLoader).toHaveBeenCalledTimes(2);
  });
});

describe("resolveConversationSearchLimits", () => {
  it("keeps scan coverage wider than the visible result limit", () => {
    expect(resolveConversationSearchLimits({ limit: 20 })).toEqual({
      resultLimit: 20,
      scanLimit: 160,
    });
    expect(resolveConversationSearchLimits({ limit: 120 })).toEqual({
      resultLimit: 120,
      scanLimit: 480,
    });
  });
});

describe("buildConversationSearchProviderBudgets", () => {
  it("splits the shared scan budget across providers", () => {
    const budgets = buildConversationSearchProviderBudgets(
      ["codex", "chatgpt", "claude", "gemini", "copilot"],
      160,
    );

    expect(budgets.map((entry) => entry.provider)).toEqual([
      "codex",
      "chatgpt",
      "claude",
      "gemini",
      "copilot",
    ]);
    expect(budgets.reduce((sum, entry) => sum + entry.limit, 0)).toBe(160);
    expect(
      Object.fromEntries(budgets.map((entry) => [entry.provider, entry.limit])),
    ).toEqual({
      codex: 42,
      chatgpt: 19,
      claude: 42,
      gemini: 31,
      copilot: 26,
    });
  });

  it("gives a single provider the full scan budget", () => {
    expect(buildConversationSearchProviderBudgets(["chatgpt"], 160)).toEqual([
      { provider: "chatgpt", limit: 160 },
    ]);
  });
});

describe("isMetadataOnlyConversationQuery", () => {
  it("detects file/session/path oriented queries", () => {
    expect(isMetadataOnlyConversationQuery("rollout-2026-03-25")).toBe(true);
    expect(isMetadataOnlyConversationQuery("agent-session.jsonl")).toBe(true);
    expect(isMetadataOnlyConversationQuery("/workspace/.codex/sessions")).toBe(true);
    expect(isMetadataOnlyConversationQuery("69ab83eb-72a0-8320-8853-72ca88526762")).toBe(true);
  });

  it("keeps normal phrase searches transcript-eligible", () => {
    expect(isMetadataOnlyConversationQuery("open the transcript")).toBe(false);
    expect(isMetadataOnlyConversationQuery("cleanup preview token")).toBe(false);
  });
});

describe("defaultConversationSearchProviders", () => {
  it("tracks the shared searchable provider contract", () => {
    expect(defaultConversationSearchProviders()).toEqual([
      ...SEARCHABLE_PROVIDER_IDS,
    ]);
  });
});
