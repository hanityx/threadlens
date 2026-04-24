import { describe, expect, it, vi } from "vitest";

const mockGetProviderSessionScan = vi.hoisted(() => vi.fn());
const mockLoadCodexUiState = vi.hoisted(() => vi.fn());
const mockCollectCodexLocalRefs = vi.hoisted(() => vi.fn());
const mockReadCodexSessionMeta = vi.hoisted(() => vi.fn());

vi.mock("../providers/search.js", () => ({
  getProviderSessionScan: mockGetProviderSessionScan,
}));

vi.mock("./state.js", () => ({
  loadCodexUiState: mockLoadCodexUiState,
}));

vi.mock("./metadata.js", () => ({
  collectCodexLocalRefs: mockCollectCodexLocalRefs,
  readCodexSessionMeta: mockReadCodexSessionMeta,
}));

import { getOverviewTs } from "./overview.js";

describe("getOverviewTs", () => {
  it("keeps locally archived threads in the read model as archived_sessions", async () => {
    mockLoadCodexUiState.mockResolvedValueOnce({
      titles: {},
      order: [],
      pinned: [],
      archived: ["thread-archived"],
      workspaces: [],
      active: [],
      labels: {},
    });
    mockGetProviderSessionScan.mockResolvedValueOnce({
      rows: [
        {
          session_id: "thread-live",
          display_title: "Live thread",
          file_path: "/tmp/live.jsonl",
          source: "sessions",
          size_bytes: 2048,
          mtime: "2026-04-24T00:00:00.000Z",
          probe: { ok: true, title_source: "provider-scan", detected_title: "Live thread" },
        },
        {
          session_id: "thread-archived",
          display_title: "Archived thread",
          file_path: "/tmp/archived.jsonl",
          source: "sessions",
          size_bytes: 2048,
          mtime: "2026-04-23T00:00:00.000Z",
          probe: { ok: true, title_source: "provider-scan", detected_title: "Archived thread" },
        },
      ],
    });
    mockCollectCodexLocalRefs.mockResolvedValueOnce({ refs: new Map() });
    mockReadCodexSessionMeta.mockResolvedValue({ has_session_log: true, cwd: "/tmp/threadlens" });

    const data = await getOverviewTs({ includeThreads: true, forceRefresh: true });
    const rows = data.threads as Array<{ thread_id: string; session_source: string }>;

    expect(rows.map((row) => row.thread_id)).toEqual(["thread-live", "thread-archived"]);
    expect(rows.find((row) => row.thread_id === "thread-archived")?.session_source).toBe("archived_sessions");
  });
});
