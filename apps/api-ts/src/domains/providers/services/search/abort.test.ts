import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import { describe, expect, it, vi } from "vitest";
import { searchConversationSessionHits, searchConversationSessions } from "./index.js";
import { deferred, makeRow, makeTranscript, waitForCondition } from "./test-fixtures.js";

describe("abort propagation", () => {
  it("propagates abort signals into conversation search loaders", async () => {
    const controller = new AbortController();
    controller.abort();
    const rawFileSearchLoader = vi.fn(async (_rows, _q, options) => {
      if (options?.signal?.aborted) {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }
      return new Map();
    });

    await expect(
      searchConversationSessions([makeRow()], "token", {
        signal: controller.signal,
        rawFileSearchLoader,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(rawFileSearchLoader).toHaveBeenCalled();
  });

  it("aborts before rebuilding provider scans when the signal is already cancelled", async () => {
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
        ok: true,
        format: "jsonl",
        error: null,
        detected_title: "",
        title_source: null,
      })),
    }));
    vi.doMock("../../matrix.js", () => ({
      providerStatus: vi.fn(() => "ready"),
    }));

    const controller = new AbortController();
    controller.abort();

    try {
      const mod = await import("./index.js");
      await expect(
        mod.getProviderSessionScan("claude", 1, { signal: controller.signal }),
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(walkFilesByExt).not.toHaveBeenCalled();
      expect(statMock).not.toHaveBeenCalled();
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

  it("lets callers abort while waiting on a shared manifest inflight promise", async () => {
    vi.resetModules();
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-search-test-"));
    vi.stubEnv("THREADLENS_SEARCH_CACHE_DIR", cacheDir);
    const firstWalk = deferred<string[]>();
    const walkFilesByExt = vi
      .fn()
      .mockImplementationOnce(async () => firstWalk.promise);
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
        ok: true,
        format: "jsonl",
        error: null,
        detected_title: "",
        title_source: null,
      })),
    }));
    vi.doMock("../../matrix.js", () => ({
      providerStatus: vi.fn(() => "ready"),
    }));

    try {
      const mod = await import("./index.js");
      const firstRequest = mod.getProviderSessionScan("claude", 1);
      await waitForCondition(
        () => walkFilesByExt.mock.calls.length === 1,
        "the shared manifest rebuild to start",
      );

      const controller = new AbortController();
      const secondRequest = mod.getProviderSessionScan("claude", 2, {
        signal: controller.signal,
      });
      controller.abort();

      await expect(secondRequest).rejects.toMatchObject({ name: "AbortError" });
      firstWalk.resolve(["/virtual/claude/session-a.jsonl"]);
      const firstScan = await firstRequest;
      expect(firstScan.rows[0]?.file_path).toContain("session-a.jsonl");
      expect(walkFilesByExt).toHaveBeenCalledTimes(1);
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

  it("keeps shared manifest work alive when the first caller aborts", async () => {
    vi.resetModules();
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-search-test-"));
    vi.stubEnv("THREADLENS_SEARCH_CACHE_DIR", cacheDir);
    const firstWalk = deferred<string[]>();
    const walkFilesByExt = vi
      .fn()
      .mockImplementationOnce(async () => firstWalk.promise);
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
        realpath: vi.fn(async (target: string) => path.resolve(target)),
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
        ok: true,
        format: "jsonl",
        error: null,
        detected_title: "",
        title_source: null,
      })),
    }));
    vi.doMock("../../matrix.js", () => ({
      providerStatus: vi.fn(() => "ready"),
    }));

    try {
      const mod = await import("./index.js");
      const controller = new AbortController();
      const firstRequest = mod.getProviderSessionScan("claude", 1, {
        signal: controller.signal,
      });
      await waitForCondition(
        () => walkFilesByExt.mock.calls.length === 1,
        "the shared manifest rebuild to start",
      );
      const secondRequest = mod.getProviderSessionScan("claude", 1);

      controller.abort();
      await expect(firstRequest).rejects.toMatchObject({ name: "AbortError" });

      firstWalk.resolve(["/virtual/claude/session-a.jsonl"]);
      const secondScan = await secondRequest;
      expect(secondScan.rows[0]?.file_path).toContain("session-a.jsonl");
      expect(walkFilesByExt).toHaveBeenCalledTimes(1);
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
