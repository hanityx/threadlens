import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import { describe, expect, it, vi } from "vitest";

describe("searchConversationSessionHitsTs", () => {
  it("returns null when a manifest candidate points to a deleted session file", async () => {
    vi.resetModules();
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-search-test-"));
    vi.stubEnv("THREADLENS_SEARCH_CACHE_DIR", cacheDir);
    const walkFilesByExt = vi.fn(async () => ["/virtual/claude/session-a.jsonl"]);
    const statMock = vi.fn(async () => ({
      size: 128,
      mtimeMs: Date.parse("2026-03-25T10:00:00.000Z"),
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
      probeSessionFile: vi.fn(async () => ({
        ok: false,
        format: null,
        error: "missing",
        detected_title: "",
        title_source: null,
      })),
    }));
    vi.doMock("../../matrix.js", () => ({
      providerStatus: vi.fn(() => "ready"),
    }));

    try {
      const mod = await import("./index.js");
      const result = await mod.searchConversationSessionHitsTs("token", {
        provider: "claude",
        sessionId: "session-a",
        filePath: "/virtual/claude/session-a.jsonl",
      });

      expect(result).toBeNull();
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
      vi.doUnmock("../../../../lib/utils.js");
      vi.doUnmock("node:fs/promises");
      vi.doUnmock("../../path-safety.js");
      vi.doUnmock("../../title-detection.js");
      vi.doUnmock("../../probe.js");
      vi.doUnmock("../../matrix.js");
      await rm(cacheDir, { recursive: true, force: true });
    }
  });
});
