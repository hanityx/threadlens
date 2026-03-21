import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  analyzeDeleteTs,
  buildCleanupConfirmTokenTs,
  executeLocalCleanupTs,
} from "./cleanup.js";

async function makeFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "po-cleanup-"));
  const chatDir = path.join(root, "chat");
  const cacheDir = path.join(chatDir, "conversations-v3-main");
  const codexHome = path.join(root, ".codex");
  const sessionsDir = path.join(codexHome, "sessions", "2026", "03", "14");
  const backupRoot = path.join(root, "backups");
  const stateFilePath = path.join(codexHome, ".codex-global-state.json");
  await mkdir(cacheDir, { recursive: true });
  await mkdir(sessionsDir, { recursive: true });
  await mkdir(backupRoot, { recursive: true });
  const threadId = "thread-1";
  const cacheFile = path.join(cacheDir, `${threadId}.data`);
  const sessionFile = path.join(sessionsDir, `rollout-2026-03-14T00-00-00-${threadId}.jsonl`);
  await writeFile(cacheFile, "cache", "utf-8");
  await writeFile(
    sessionFile,
    `${JSON.stringify({ type: "session_meta", payload: { cwd: "/tmp/demo" } })}\n`,
    "utf-8",
  );
  await writeFile(
    stateFilePath,
    JSON.stringify(
      {
        "thread-titles": {
          titles: { [threadId]: "Fixture thread" },
          order: [threadId],
        },
        "pinned-thread-ids": [threadId],
      },
      null,
      2,
    ),
    "utf-8",
  );
  return { threadId, chatDir, codexHome, backupRoot, stateFilePath, cacheFile, sessionFile };
}

describe("thread cleanup", () => {
  it("analyzeDeleteTs reports state and local/session impacts", async () => {
    const fixture = await makeFixture();
    const data = await analyzeDeleteTs([fixture.threadId], {
      roots: { chatDir: fixture.chatDir, stateFilePath: fixture.stateFilePath },
      resolveSessionPath: async (threadId) =>
        threadId === fixture.threadId ? fixture.sessionFile : null,
    });
    expect(data.count).toBe(1);
    expect(data.reports[0]?.exists).toBe(true);
    expect(data.reports[0]?.parents).toContain("global-state:thread-titles");
    expect(data.reports[0]?.parents).toContain(".codex:sessions/archived_sessions");
  });

  it("executeLocalCleanupTs dry-run emits confirm token and target count", async () => {
    const fixture = await makeFixture();
    const data = await executeLocalCleanupTs([fixture.threadId], {
      dryRun: true,
      roots: {
        chatDir: fixture.chatDir,
        codexHome: fixture.codexHome,
        backupRoot: fixture.backupRoot,
        stateFilePath: fixture.stateFilePath,
      },
    });
    expect(data.ok).toBe(true);
    expect(data.mode).toBe("dry-run");
    expect(data.target_file_count).toBe(2);
    expect(String(data.confirm_token_expected)).toMatch(/^DEL-/);
  });

  it("executeLocalCleanupTs executes delete and state cleanup with correct token", async () => {
    const fixture = await makeFixture();
    const preview = await executeLocalCleanupTs([fixture.threadId], {
      dryRun: true,
      roots: {
        chatDir: fixture.chatDir,
        codexHome: fixture.codexHome,
        backupRoot: fixture.backupRoot,
        stateFilePath: fixture.stateFilePath,
      },
    });
    const result = await executeLocalCleanupTs([fixture.threadId], {
      dryRun: false,
      confirmToken: String(preview.confirm_token_expected),
      roots: {
        chatDir: fixture.chatDir,
        codexHome: fixture.codexHome,
        backupRoot: fixture.backupRoot,
        stateFilePath: fixture.stateFilePath,
      },
    });
    expect(result.ok).toBe(true);
    expect(result.deleted_file_count).toBe(2);
    expect(result.backup.copied_count).toBeGreaterThanOrEqual(2);
    const state = JSON.parse(await readFile(fixture.stateFilePath, "utf-8"));
    expect(state["thread-titles"].titles).toEqual({});
    expect(state["thread-titles"].order).toEqual([]);
    expect(state["pinned-thread-ids"]).toEqual([]);
  });

  it("buildCleanupConfirmTokenTs is stable for same inputs", () => {
    const one = buildCleanupConfirmTokenTs(["b", "a"], ["/tmp/y", "/tmp/x"], {
      delete_cache: true,
      delete_session_logs: true,
      clean_state_refs: true,
    });
    const two = buildCleanupConfirmTokenTs(["a", "b"], ["/tmp/x", "/tmp/y"], {
      delete_cache: true,
      delete_session_logs: true,
      clean_state_refs: true,
    });
    expect(one).toBe(two);
  });
});
