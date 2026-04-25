import Fastify, { type FastifyInstance } from "fastify";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockArchiveThreadsLocalTs = vi.hoisted(() => vi.fn());
const mockUnarchiveThreadsLocalTs = vi.hoisted(() => vi.fn());
const mockGetThreadResumeCommandsTs = vi.hoisted(() => vi.fn());
const mockRenameThreadTitleTs = vi.hoisted(() => vi.fn());
const mockSetThreadPinnedTs = vi.hoisted(() => vi.fn());
const mockAnalyzeDeleteTs = vi.hoisted(() => vi.fn());
const mockExecuteBackupCleanupTs = vi.hoisted(() => vi.fn());
const mockExecuteLocalCleanupTs = vi.hoisted(() => vi.fn());
const mockGetThreadForensicsTs = vi.hoisted(() => vi.fn());
const mockGetThreadsTs = vi.hoisted(() => vi.fn());
const mockBuildSessionTranscript = vi.hoisted(() => vi.fn());
const mockInvalidateCodexThreadTitleMapCache = vi.hoisted(() => vi.fn());
const mockResolveCodexSessionPathByThreadId = vi.hoisted(() => vi.fn());
const mockExecFile = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: mockExecFile,
}));

vi.mock("../../domains/threads/state.js", () => ({
  archiveThreadsLocalTs: mockArchiveThreadsLocalTs,
  unarchiveThreadsLocalTs: mockUnarchiveThreadsLocalTs,
  getThreadResumeCommandsTs: mockGetThreadResumeCommandsTs,
  renameThreadTitleTs: mockRenameThreadTitleTs,
  setThreadPinnedTs: mockSetThreadPinnedTs,
}));

vi.mock("../../domains/threads/cleanup.js", () => ({
  analyzeDeleteTs: mockAnalyzeDeleteTs,
  executeBackupCleanupTs: mockExecuteBackupCleanupTs,
  executeLocalCleanupTs: mockExecuteLocalCleanupTs,
}));

vi.mock("../../domains/threads/forensics.js", () => ({
  getThreadForensicsTs: mockGetThreadForensicsTs,
}));

vi.mock("../../domains/threads/query.js", () => ({
  getThreadsTs: mockGetThreadsTs,
}));

vi.mock("../../domains/providers/transcript.js", () => ({
  buildSessionTranscript: mockBuildSessionTranscript,
}));

vi.mock("../../domains/providers/title-detection.js", () => ({
  invalidateCodexThreadTitleMapCache: mockInvalidateCodexThreadTitleMapCache,
}));

vi.mock("../../domains/providers/search.js", () => ({
  resolveCodexSessionPathByThreadId: mockResolveCodexSessionPathByThreadId,
}));

import { registerThreadRoutes } from "./threads.js";

describe("registerThreadRoutes cleanup invalidation", () => {
  let app: FastifyInstance;
  let tempDir = "";
  const invalidateOverviewCache = vi.fn();
  const invalidateProviderSessionCache = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExecFile.mockImplementation(
      (_command: string, _args: string[], callback: (error: Error | null) => void) => callback(null),
    );
    tempDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-thread-routes-"));
    app = Fastify();
    await registerThreadRoutes(app, {
      invalidateOverviewCache,
      invalidateProviderSessionCache,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
  });

  it("invalidates overview and provider session caches after execute", async () => {
    mockExecuteLocalCleanupTs.mockResolvedValue({
      ok: true,
      mode: "execute",
      deleted_file_count: 1,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/local-cleanup",
      payload: {
        ids: ["thread-1"],
        dry_run: false,
        confirm_token: "DEL-123",
        options: {},
      },
    });

    expect(res.statusCode).toBe(200);
    expect(invalidateOverviewCache).toHaveBeenCalledTimes(1);
    expect(invalidateProviderSessionCache).toHaveBeenCalledTimes(1);
    expect(invalidateProviderSessionCache).toHaveBeenCalledWith("codex");
  });

  it("invalidates caches and returns 207 for partial cleanup execution", async () => {
    mockExecuteLocalCleanupTs.mockResolvedValue({
      ok: false,
      mode: "partial",
      deleted_file_count: 1,
      failed: [{ path: "/tmp/missing.jsonl", error: "unlink failed" }],
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/local-cleanup",
      payload: {
        ids: ["thread-1"],
        dry_run: false,
        confirm_token: "DEL-123",
        options: {},
      },
    });

    expect(res.statusCode).toBe(207);
    expect(invalidateOverviewCache).toHaveBeenCalledTimes(1);
    expect(invalidateProviderSessionCache).toHaveBeenCalledTimes(1);
    expect(invalidateProviderSessionCache).toHaveBeenCalledWith("codex");
  });

  it("does not invalidate caches for dry-run responses", async () => {
    mockExecuteLocalCleanupTs.mockResolvedValue({
      ok: true,
      mode: "dry-run",
      confirm_token_expected: "DEL-123",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/local-cleanup",
      payload: {
        ids: ["thread-1"],
        dry_run: true,
        options: {},
      },
    });

    expect(res.statusCode).toBe(200);
    expect(invalidateOverviewCache).not.toHaveBeenCalled();
    expect(invalidateProviderSessionCache).not.toHaveBeenCalled();
  });

  it("forwards analyze-delete session scan limits", async () => {
    mockAnalyzeDeleteTs.mockResolvedValue({
      count: 1,
      reports: [{ id: "thread-1", exists: true }],
      session_scan_limit: 12,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/analyze-delete",
      payload: {
        ids: ["thread-1"],
        session_scan_limit: 12,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(mockAnalyzeDeleteTs).toHaveBeenCalledWith(["thread-1"], {
      sessionScanLimit: 12,
    });
  });

  it("runs local unarchive through the bulk thread action route", async () => {
    mockUnarchiveThreadsLocalTs.mockResolvedValue({
      ok: true,
      mode: "local-unhide",
      requested_ids: ["thread-archived"],
      total_archived: 0,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/bulk-thread-action",
      payload: {
        action: "unarchive_local",
        thread_ids: ["thread-archived"],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(mockUnarchiveThreadsLocalTs).toHaveBeenCalledWith(["thread-archived"]);
    expect(res.json().data.results[0]).toMatchObject({
      thread_id: "thread-archived",
      ok: true,
      status: 200,
    });
  });

  it("invalidates overview, provider session cache, and codex title cache after rename", async () => {
    mockRenameThreadTitleTs.mockResolvedValue({
      ok: true,
      thread_id: "thread-1",
      title: "Renamed thread",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/rename-thread",
      payload: {
        id: "thread-1",
        title: "Renamed thread",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(invalidateOverviewCache).toHaveBeenCalledTimes(1);
    expect(invalidateProviderSessionCache).toHaveBeenCalledTimes(1);
    expect(invalidateProviderSessionCache).toHaveBeenCalledWith("codex");
    expect(mockInvalidateCodexThreadTitleMapCache).toHaveBeenCalledTimes(1);
  });

  it("opens the folder for a resolved thread session file", async () => {
    const sessionPath = path.join(tempDir, "rollout-thread-1.jsonl");
    await writeFile(sessionPath, "{}\n", "utf-8");
    mockResolveCodexSessionPathByThreadId.mockResolvedValue(sessionPath);

    const res = await app.inject({
      method: "POST",
      url: "/api/thread-open-folder",
      payload: {
        thread_id: "thread-1",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(mockResolveCodexSessionPathByThreadId).toHaveBeenCalledWith("thread-1");
    expect(mockExecFile).toHaveBeenCalledWith(
      process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open",
      [tempDir],
      expect.any(Function),
    );
  });
});
