import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const mockUnlink = vi.hoisted(() => vi.fn());

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  mockUnlink.mockImplementation(actual.unlink);
  return {
    ...actual,
    unlink: mockUnlink,
  };
});

vi.mock("./overview.js", () => ({
  getOverviewTs: vi.fn(),
}));

import { executeLocalCleanupTs } from "./cleanup.js";

describe("executeLocalCleanupTs partial failure contract", () => {
  it("returns partial when one selected file cannot be deleted", async () => {
    const actualFs = await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
    const root = await mkdtemp(path.join(os.tmpdir(), "po-cleanup-partial-"));
    const chatDir = path.join(root, "chat");
    const cacheDir = path.join(chatDir, "conversations-v3-main");
    const codexHome = path.join(root, ".codex");
    const sessionsDir = path.join(codexHome, "sessions", "2026", "03", "14");
    const backupRoot = path.join(root, "backups");
    const stateFilePath = path.join(codexHome, ".codex-global-state.json");
    const threadId = "thread-1";
    const cacheFile = path.join(cacheDir, `${threadId}.data`);
    const sessionFile = path.join(sessionsDir, `rollout-2026-03-14T00-00-00-${threadId}.jsonl`);
    await mkdir(cacheDir, { recursive: true });
    await mkdir(sessionsDir, { recursive: true });
    await mkdir(backupRoot, { recursive: true });
    await writeFile(cacheFile, "cache", "utf-8");
    await writeFile(sessionFile, "{}\n", "utf-8");
    await writeFile(
      stateFilePath,
      JSON.stringify({
        "thread-titles": { titles: { [threadId]: "Fixture" }, order: [threadId] },
        "pinned-thread-ids": [threadId],
      }),
      "utf-8",
    );

    const preview = await executeLocalCleanupTs([threadId], {
      dryRun: true,
      roots: { chatDir, codexHome, backupRoot, stateFilePath },
    });
    mockUnlink.mockImplementation(async (filePath: string) => {
      if (path.resolve(filePath) === cacheFile) {
        throw new Error("unlink denied");
      }
      return actualFs.unlink(filePath);
    });

    const result = await executeLocalCleanupTs([threadId], {
      dryRun: false,
      confirmToken: String(preview.confirm_token_expected),
      roots: { chatDir, codexHome, backupRoot, stateFilePath },
    });

    expect(result.ok).toBe(false);
    expect(result.mode).toBe("partial");
    expect(result.deleted_file_count).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failure_summary).toMatchObject({
      failed_count: 1,
      partial_failure: true,
      delete_failed_count: 1,
    });
    expect(JSON.parse(await readFile(stateFilePath, "utf-8"))["thread-titles"].titles).toEqual({});
  });
});
