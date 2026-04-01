import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockArchiveThreadsLocalTs = vi.hoisted(() => vi.fn());
const mockGetThreadResumeCommandsTs = vi.hoisted(() => vi.fn());
const mockRenameThreadTitleTs = vi.hoisted(() => vi.fn());
const mockSetThreadPinnedTs = vi.hoisted(() => vi.fn());
const mockAnalyzeDeleteTs = vi.hoisted(() => vi.fn());
const mockExecuteLocalCleanupTs = vi.hoisted(() => vi.fn());
const mockGetThreadForensicsTs = vi.hoisted(() => vi.fn());
const mockGetThreadsTs = vi.hoisted(() => vi.fn());
const mockBuildSessionTranscript = vi.hoisted(() => vi.fn());
const mockInvalidateCodexThreadTitleMapCache = vi.hoisted(() => vi.fn());
const mockResolveCodexSessionPathByThreadId = vi.hoisted(() => vi.fn());

vi.mock("../../domains/threads/state.js", () => ({
  archiveThreadsLocalTs: mockArchiveThreadsLocalTs,
  getThreadResumeCommandsTs: mockGetThreadResumeCommandsTs,
  renameThreadTitleTs: mockRenameThreadTitleTs,
  setThreadPinnedTs: mockSetThreadPinnedTs,
}));

vi.mock("../../domains/threads/cleanup.js", () => ({
  analyzeDeleteTs: mockAnalyzeDeleteTs,
  executeLocalCleanupTs: mockExecuteLocalCleanupTs,
}));

vi.mock("../../domains/threads/forensics.js", () => ({
  getThreadForensicsTs: mockGetThreadForensicsTs,
}));

vi.mock("../../domains/threads/query.js", () => ({
  getThreadsTs: mockGetThreadsTs,
}));

vi.mock("../../lib/providers.js", () => ({
  buildSessionTranscript: mockBuildSessionTranscript,
  invalidateCodexThreadTitleMapCache: mockInvalidateCodexThreadTitleMapCache,
}));

vi.mock("../../domains/providers/search.js", () => ({
  resolveCodexSessionPathByThreadId: mockResolveCodexSessionPathByThreadId,
}));

import { registerThreadRoutes } from "./threads.js";

describe("registerThreadRoutes cleanup invalidation", () => {
  let app: FastifyInstance;
  const invalidateOverviewCache = vi.fn();
  const invalidateProviderSessionCache = vi.fn();

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await registerThreadRoutes(app, {
      invalidateOverviewCache,
      invalidateProviderSessionCache,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
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
});
