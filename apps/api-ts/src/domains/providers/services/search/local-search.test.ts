import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import { describe, expect, it, vi } from "vitest";

describe("searchLocalConversationsTs metadata-only fast path", () => {
  it("avoids probing session files for metadata-only queries", async () => {
    vi.resetModules();
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-search-test-"));
    vi.stubEnv("THREADLENS_SEARCH_CACHE_DIR", cacheDir);

    const walkFilesByExt = vi.fn(async () => [
      "/virtual/claude/rollout-2026-03-25T10-00-00-019d-meta-only.jsonl",
    ]);
    const statMock = vi.fn(async (target: string) => {
      if (target === "/virtual/claude") {
        return {
          size: 0,
          mtimeMs: Date.parse("2026-03-25T10:00:00.000Z"),
        };
      }
      return {
        size: 128,
        mtimeMs: Date.parse("2026-03-25T10:00:00.000Z"),
      };
    });
    const probeSessionFile = vi.fn(async () => ({
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: "Should not load",
      title_source: "fixture",
    }));

    vi.doMock("../../../../lib/utils.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../../../../lib/utils.js")>();
      return {
        ...actual,
        walkFilesByExt,
      };
    });
    vi.doMock("node:fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs/promises")>();
      return {
        ...actual,
        stat: statMock,
      };
    });
    vi.doMock("../../path-safety.js", () => ({
      providerScanRootSpecs: async () => [
        {
          root: "/virtual/claude",
          source: "projects",
          exts: [".jsonl"],
        },
      ],
      providerName: () => "Claude",
      codexTranscriptSearchRoots: async () => [],
    }));
    vi.doMock("../../title-detection.js", () => ({
      getCodexThreadTitleMap: vi.fn(async () => new Map()),
      invalidateCodexThreadTitleMapCache: vi.fn(),
      extractCodexThreadIdFromSessionName: vi.fn(() => ""),
    }));
    vi.doMock("../../probe.js", () => ({
      inferSessionId: vi.fn((filePath: string) =>
        filePath.split("/").at(-1)?.replace(/\.jsonl$/i, "") ?? filePath,
      ),
      isCopilotGlobalSessionLikeFile: vi.fn(() => false),
      isWorkspaceChatSessionPath: vi.fn(() => false),
      probeSessionFile,
    }));
    vi.doMock("../../matrix.js", () => ({
      providerStatus: vi.fn(() => "ready"),
    }));
    vi.doMock("../../../threads/query.js", () => ({
      getThreadsTs: vi.fn(async () => ({ rows: [] })),
    }));

    try {
      const mod = await import("./index.js");
      const result = await mod.searchLocalConversationsTs(
        "rollout-2026-03-25",
        {
          providers: ["claude"],
          pageSize: 10,
          sessionLimitPerProvider: 1,
        },
      );

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]?.session_id).toContain("rollout-2026-03-25");
      expect(probeSessionFile).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
      vi.doUnmock("../../../../lib/utils.js");
      vi.doUnmock("node:fs/promises");
      vi.doUnmock("../../path-safety.js");
      vi.doUnmock("../../title-detection.js");
      vi.doUnmock("../../probe.js");
      vi.doUnmock("../../matrix.js");
      vi.doUnmock("../../../threads/query.js");
      await rm(cacheDir, { recursive: true, force: true });
    }
  });
});
