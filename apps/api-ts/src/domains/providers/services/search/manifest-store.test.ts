import { createHash } from "node:crypto";
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { describe, expect, it, vi } from "vitest";
import { deferred, waitForCondition } from "./test-fixtures.js";

describe("provider manifest cache behavior", () => {
  it("reuses the provider manifest after the scan cache TTL until invalidated", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-25T10:00:00.000Z"));
    vi.resetModules();
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-search-test-"));
    vi.stubEnv("THREADLENS_SEARCH_CACHE_DIR", cacheDir);

    const walkFilesByExt = vi.fn(async () => ["/virtual/claude/session-a.jsonl"]);
    const statMock = vi.fn(async () => ({
      size: 128,
      mtimeMs: Date.parse("2026-03-25T10:00:00.000Z"),
    }));
    const realpathMock = vi.fn(async (target: string) => path.resolve(target));
    const probeSessionFile = vi.fn(async () => ({
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: "",
      title_source: null,
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
        realpath: realpathMock,
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

    try {
      const mod = await import("./index.js");

      await mod.getProviderSessionScan("claude", 1);
      expect(walkFilesByExt).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(61_000);

      await mod.getProviderSessionScan("claude", 1);
      expect(walkFilesByExt).toHaveBeenCalledTimes(1);
      expect(probeSessionFile).toHaveBeenCalledTimes(2);

      mod.invalidateProviderSearchCaches("claude");
      await mod.getProviderSessionScan("claude", 1);
      expect(walkFilesByExt).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
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

  it("reuses a persisted provider manifest across module reloads", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-25T10:00:00.000Z"));
    vi.resetModules();
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-search-test-"));
    vi.stubEnv("THREADLENS_SEARCH_CACHE_DIR", cacheDir);

    const installMocks = (walkFilesByExt: ReturnType<typeof vi.fn>) => {
      const statMock = vi.fn(async () => ({
        size: 128,
        mtimeMs: Date.parse("2026-03-25T10:00:00.000Z"),
      }));
      const realpathMock = vi.fn(async (target: string) => path.resolve(target));
      const probeSessionFile = vi.fn(async () => ({
        ok: true,
        format: "jsonl",
        error: null,
        detected_title: "",
        title_source: null,
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
          realpath: realpathMock,
          stat: statMock,
        };
      });
      vi.doMock("../../path-safety.js", () => ({
        providerScanRootSpecs: async () => [
          { root: "/virtual/claude", source: "projects", exts: [".jsonl"] },
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
    };

    try {
      const firstWalk = vi.fn(async () => ["/virtual/claude/session-a.jsonl"]);
      installMocks(firstWalk);
      const firstMod = await import("./index.js");
      await firstMod.getProviderSessionScan("claude", 1);
      expect(firstWalk).toHaveBeenCalledTimes(1);

      vi.resetModules();

      const secondWalk = vi.fn(async () => ["/virtual/claude/session-b.jsonl"]);
      installMocks(secondWalk);
      const secondMod = await import("./index.js");
      const secondScan = await secondMod.getProviderSessionScan("claude", 1);
      expect(secondWalk).not.toHaveBeenCalled();
      expect(secondScan.rows[0]?.source).toBe("projects");
    } finally {
      vi.useRealTimers();
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

  it("reclassifies persisted manifest candidate source from the current matching root", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-25T10:00:00.000Z"));
    vi.resetModules();
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-search-test-"));
    vi.stubEnv("THREADLENS_SEARCH_CACHE_DIR", cacheDir);

    const version = createHash("sha1").update("claude").digest("hex").slice(0, 8);
    const cacheFile = path.join(cacheDir, `manifest-claude-${version}.json`);
    const sessionPath = "/virtual/claude/session-a.jsonl";
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(
      cacheFile,
      JSON.stringify({
        expires_at: Date.now() + 60_000,
        manifest: {
          provider: "claude",
          name: "Claude",
          root_exists: true,
          candidates: [
            {
              source: "stale-cache-source",
              file_path: sessionPath,
              size_bytes: 128,
              mtime: "2026-03-25T10:00:00.000Z",
              mtime_ms: Date.parse("2026-03-25T10:00:00.000Z"),
            },
          ],
          total_bytes: 128,
        },
      }),
      "utf8",
    );

    vi.doMock("node:fs/promises", async (importOriginal) => {
      const actual = await importOriginal<typeof import("node:fs/promises")>();
      return {
        ...actual,
        realpath: vi.fn(async (target: string) => path.resolve(target)),
      };
    });
    vi.doMock("../../path-safety.js", () => ({
      providerScanRootSpecs: async () => [
        { root: "/virtual/claude", source: "projects", exts: [".jsonl"] },
      ],
    }));

    try {
      const { readPersistedProviderManifest } = await import(
        "./manifest-store.js"
      );
      const persisted = await readPersistedProviderManifest("claude");

      expect(persisted?.manifest.candidates).toHaveLength(1);
      expect(persisted?.manifest.candidates[0]).toMatchObject({
        file_path: path.resolve(sessionPath),
        source: "projects",
      });
    } finally {
      vi.useRealTimers();
      vi.unstubAllEnvs();
      vi.resetModules();
      vi.doUnmock("node:fs/promises");
      vi.doUnmock("../../path-safety.js");
      await rm(cacheDir, { recursive: true, force: true });
    }
  });

  it("discards persisted manifest candidates outside current provider roots", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-25T10:00:00.000Z"));
    vi.resetModules();
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-search-test-"));
    vi.stubEnv("THREADLENS_SEARCH_CACHE_DIR", cacheDir);

    const version = createHash("sha1").update("claude").digest("hex").slice(0, 8);
    const cacheFile = path.join(cacheDir, `manifest-claude-${version}.json`);
    await mkdir(path.dirname(cacheFile), { recursive: true });
    await writeFile(
      cacheFile,
      JSON.stringify({
        expires_at: Date.now() + 60_000,
        manifest: {
          provider: "claude",
          name: "Claude",
          root_exists: true,
          candidates: [
            {
              source: "projects",
              file_path: "/outside/session-a.jsonl",
              size_bytes: 128,
              mtime: "2026-03-25T10:00:00.000Z",
              mtime_ms: Date.parse("2026-03-25T10:00:00.000Z"),
            },
          ],
          total_bytes: 128,
        },
      }),
      "utf8",
    );

    const walkFilesByExt = vi.fn(async () => ["/virtual/claude/session-b.jsonl"]);
    const statMock = vi.fn(async () => ({
      size: 256,
      mtimeMs: Date.parse("2026-03-25T10:05:00.000Z"),
    }));
    const realpathMock = vi.fn(async (target: string) => path.resolve(target));
    const probeSessionFile = vi.fn(async (filePath: string) => ({
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: path.basename(filePath, ".jsonl"),
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
        realpath: realpathMock,
        stat: statMock,
      };
    });
    vi.doMock("../../path-safety.js", () => ({
      providerScanRootSpecs: async () => [
        { root: "/virtual/claude", source: "projects", exts: [".jsonl"] },
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

    try {
      const mod = await import("./index.js");
      const scan = await mod.getProviderSessionScan("claude", 1);

      expect(walkFilesByExt).toHaveBeenCalledTimes(1);
      expect(scan.rows[0]?.file_path).toBe("/virtual/claude/session-b.jsonl");
      expect(probeSessionFile).toHaveBeenCalledWith("/virtual/claude/session-b.jsonl");
    } finally {
      vi.useRealTimers();
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

  it("does not let a stale inflight rebuild overwrite a newer manifest after invalidation", async () => {
    vi.resetModules();
    const cacheDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-search-test-"));
    vi.stubEnv("THREADLENS_SEARCH_CACHE_DIR", cacheDir);

    const firstWalk = deferred<string[]>();
    const walkFilesByExt = vi
      .fn()
      .mockImplementationOnce(async () => firstWalk.promise)
      .mockImplementationOnce(async () => ["/virtual/claude/session-b.jsonl"]);
    const statMock = vi.fn(async (filePath: string) => ({
      size: 128,
      mtimeMs: filePath.includes("session-b")
        ? Date.parse("2026-03-25T10:05:00.000Z")
        : Date.parse("2026-03-25T10:00:00.000Z"),
    }));
    const probeSessionFile = vi.fn(async (filePath: string) => ({
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: path.basename(filePath, ".jsonl"),
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
        { root: "/virtual/claude", source: "projects", exts: [".jsonl"] },
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

    try {
      const mod = await import("./index.js");
      const stalePromise = mod.getProviderSessionScan("claude", 1);
      await waitForCondition(
        () => walkFilesByExt.mock.calls.length === 1,
        "the stale manifest rebuild to start",
      );

      mod.invalidateProviderSearchCaches("claude");
      const freshPromise = mod.getProviderSessionScan("claude", 1);
      const freshScan = await freshPromise;

      expect(freshScan.rows[0]?.file_path).toContain("session-b.jsonl");

      firstWalk.resolve(["/virtual/claude/session-a.jsonl"]);
      const staleScan = await stalePromise;
      expect(staleScan.rows[0]?.file_path).toContain("session-a.jsonl");

      const cachedScan = await mod.getProviderSessionScan("claude", 1);
      expect(cachedScan.rows[0]?.file_path).toContain("session-b.jsonl");
      expect(walkFilesByExt).toHaveBeenCalledTimes(2);
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
