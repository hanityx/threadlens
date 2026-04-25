import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const mockGetOverviewTs = vi.hoisted(() => vi.fn());

vi.mock("./overview.js", () => ({
  getOverviewTs: mockGetOverviewTs,
}));

import {
  analyzeDeleteTs,
  buildCleanupConfirmTokenTs,
  executeBackupCleanupTs,
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
  it("hard deletes all selected cleanup_backups files by thread id", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "po-backup-cleanup-"));
    const backupRoot = path.join(root, "Documents", "ThreadLens", "backups", "provider_actions");
    const legacyBackupRoot = path.join(root, ".codex", "local_cleanup_backups", "provider_actions");
    const backupDir = path.join(backupRoot, "codex");
    const legacyBackupDir = path.join(legacyBackupRoot, "codex");
    const first = path.join(backupDir, "first", "rollout-thread-backup.jsonl");
    const second = path.join(legacyBackupDir, "second", "rollout-thread-backup.jsonl");
    const normalSession = path.join(root, ".codex", "sessions", "rollout-thread-backup.jsonl");
    await mkdir(path.dirname(first), { recursive: true });
    await mkdir(path.dirname(second), { recursive: true });
    await mkdir(path.dirname(normalSession), { recursive: true });
    await writeFile(first, "backup-1", "utf-8");
    await writeFile(second, "backup-2", "utf-8");
    await writeFile(normalSession, "normal", "utf-8");
    mockGetOverviewTs.mockResolvedValueOnce({
      threads: [
        {
          thread_id: "thread-backup",
          source: "cleanup_backups",
          local_cache_paths: [first],
        },
        {
          thread_id: "thread-backup",
          source: "cleanup_backups",
          local_cache_paths: [second],
        },
        {
          thread_id: "thread-backup",
          source: "sessions",
          local_cache_paths: [normalSession],
        },
      ],
    });

    const data = await executeBackupCleanupTs(["thread-backup"], {
      backupRoots: [backupRoot, legacyBackupRoot],
    });

    expect(data.target_file_count).toBe(2);
    expect(data.deleted_file_count).toBe(2);
    expect(data.failed).toEqual([]);
    await expect(stat(first)).rejects.toThrow();
    await expect(stat(second)).rejects.toThrow();
    await expect(stat(normalSession)).resolves.toBeTruthy();
  });

  it("does not report success when selected backup ids have no cleanup backup files", async () => {
    mockGetOverviewTs.mockResolvedValueOnce({
      threads: [
        {
          thread_id: "thread-live",
          source: "sessions",
          local_cache_paths: ["/tmp/thread-live.jsonl"],
        },
      ],
    });

    const data = await executeBackupCleanupTs(["thread-live"]);

    expect(data.ok).toBe(false);
    expect(data.error).toBe("cleanup-backups-no-targets");
    expect(data.target_file_count).toBe(0);
    expect(data.deleted_file_count).toBe(0);
  });

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

  it("analyzeDeleteTs reports mention-based cross-session links", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "po-cleanup-links-"));
    const sessionsDir = path.join(root, ".codex", "sessions", "2026", "03", "14");
    await mkdir(sessionsDir, { recursive: true });

    const threadA = "019d5de6-49b6-76b2-9626-e8e63eb8f021";
    const threadB = "019d5de6-49b6-76b2-9626-e8e63eb8f099";
    const threadC = "019d5de6-49b6-76b2-9626-e8e63eb8f111";

    const fileA = path.join(sessionsDir, `rollout-2026-03-14T00-00-00-${threadA}.jsonl`);
    const fileB = path.join(sessionsDir, `rollout-2026-03-14T00-01-00-${threadB}.jsonl`);
    const fileC = path.join(sessionsDir, `rollout-2026-03-14T00-02-00-${threadC}.jsonl`);

    await writeFile(
      fileA,
      [
        JSON.stringify({ type: "session_meta", payload: { cwd: "/tmp/demo-a" } }),
        JSON.stringify({
          type: "collab_agent_spawn_end",
          payload: { sender_thread_id: threadA, new_thread_id: threadB },
        }),
      ].join("\n"),
      "utf-8",
    );
    await writeFile(
      fileB,
      [
        JSON.stringify({
          type: "session_meta",
          payload: { cwd: "/tmp/demo-b", source: { subagent: { thread_spawn: { parent_thread_id: threadA } } } },
        }),
        JSON.stringify({ type: "message", payload: { role: "user", content: "spawned follow-up" } }),
      ].join("\n"),
      "utf-8",
    );
    await writeFile(
      fileC,
      [
        JSON.stringify({ type: "session_meta", payload: { cwd: "/tmp/demo-c" } }),
        JSON.stringify({ type: "message", payload: { role: "user", content: `another reference to ${threadA}` } }),
      ].join("\n"),
      "utf-8",
    );

    const data = await analyzeDeleteTs([threadA], {
      resolveSessionPath: async (threadId) => (threadId === threadA ? fileA : null),
      resolveCrossSessionRows: async () => [
        { session_id: threadA, display_title: "Thread A", file_path: fileA },
        { session_id: threadB, display_title: "Thread B", file_path: fileB },
        { session_id: threadC, display_title: "Thread C", file_path: fileC },
      ],
    });

    expect(data.reports[0]?.cross_session_links).toEqual({
      strong_links: 1,
      mention_links: 1,
      related_threads: 2,
      strong_samples: [
        {
          thread_id: threadB,
          title: "Thread B",
          direction: "both",
          strength: "strong",
          evidence_kind: "parent_thread_id",
          matched_field: "payload.source.subagent.thread_spawn.parent_thread_id",
          matched_event: "session_meta",
          matched_value: threadA,
          matched_excerpt: expect.stringContaining(threadA),
        },
      ],
      mention_samples: [
        {
          thread_id: threadC,
          title: "Thread C",
          direction: "inbound",
          strength: "mention",
          evidence_kind: "copied_context",
          matched_field: "payload.content",
          matched_event: "message",
          matched_value: `another reference to ${threadA}`,
          matched_excerpt: expect.stringContaining(threadA),
        },
      ],
      related_samples: [
        {
          thread_id: threadB,
          title: "Thread B",
          direction: "both",
          strength: "strong",
          evidence_kind: "parent_thread_id",
          matched_field: "payload.source.subagent.thread_spawn.parent_thread_id",
          matched_event: "session_meta",
          matched_value: threadA,
          matched_excerpt: expect.stringContaining(threadA),
        },
        {
          thread_id: threadC,
          title: "Thread C",
          direction: "inbound",
          strength: "mention",
          evidence_kind: "copied_context",
          matched_field: "payload.content",
          matched_event: "message",
          matched_value: `another reference to ${threadA}`,
          matched_excerpt: expect.stringContaining(threadA),
        },
      ],
    });
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

  it("executeLocalCleanupTs rejects unsafe thread ids before scanning paths", async () => {
    const fixture = await makeFixture();
    const data = await executeLocalCleanupTs(["../victim"], {
      dryRun: true,
      roots: {
        chatDir: fixture.chatDir,
        codexHome: fixture.codexHome,
        backupRoot: fixture.backupRoot,
        stateFilePath: fixture.stateFilePath,
      },
    });

    expect(data).toMatchObject({
      ok: false,
      mode: "dry-run",
      error: "invalid-thread-id",
      invalid_ids: ["../victim"],
      requested_ids: 1,
      target_file_count: 0,
    });
  });

  it("executeBackupCleanupTs reports invalid requested ids in requested_ids", async () => {
    const data = await executeBackupCleanupTs(["../victim"]);

    expect(data).toMatchObject({
      ok: false,
      mode: "failed",
      error: "invalid-thread-id",
      invalid_ids: ["../victim"],
      requested_ids: 1,
      target_file_count: 0,
    });
  });

  it("executeBackupCleanupTs reports partial when a cleanup backup delete fails", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "po-backup-cleanup-partial-"));
    const backupRoot = path.join(root, "provider_actions");
    const existing = path.join(backupRoot, "codex", "existing.jsonl");
    const missing = path.join(backupRoot, "codex", "missing.jsonl");
    await mkdir(path.dirname(existing), { recursive: true });
    await writeFile(existing, "backup", "utf-8");
    mockGetOverviewTs.mockResolvedValueOnce({
      threads: [
        {
          thread_id: "thread-backup",
          source: "cleanup_backups",
          local_cache_paths: [existing, missing],
        },
      ],
    });

    const data = await executeBackupCleanupTs(["thread-backup"], {
      backupRoots: [backupRoot],
    });

    expect(data.ok).toBe(false);
    expect(data.mode).toBe("partial");
    expect(data.target_file_count).toBe(2);
    expect(data.deleted_file_count).toBe(1);
    expect(data.failed).toHaveLength(1);
    expect(data.failure_summary).toMatchObject({
      failed_count: 1,
      partial_failure: true,
      delete_failed_count: 1,
    });
    await expect(stat(existing)).rejects.toThrow();
  });

  it("executeLocalCleanupTs rejects execute with mismatched cleanup token", async () => {
    const fixture = await makeFixture();
    const result = await executeLocalCleanupTs([fixture.threadId], {
      dryRun: false,
      confirmToken: "wrong-token",
      roots: {
        chatDir: fixture.chatDir,
        codexHome: fixture.codexHome,
        backupRoot: fixture.backupRoot,
        stateFilePath: fixture.stateFilePath,
      },
    });

    expect(result).toMatchObject({
      ok: false,
      mode: "failed",
      error: "confirmation token mismatch",
    });
  });

  it("executeLocalCleanupTs stops before delete when backup copy fails", async () => {
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
      backupPaths: async () => ({
        backup_dir: path.join(fixture.backupRoot, "failed"),
        copied_count: 0,
        copied: [],
        failed: [{ path: fixture.cacheFile, error: "copy failed" }],
      }),
    });

    expect(result).toMatchObject({
      ok: false,
      mode: "failed",
      error: "backup-failed-before-delete",
      deleted_file_count: 0,
      failure_summary: {
        failed_count: 1,
        partial_failure: false,
        backup_failed_count: 1,
        delete_failed_count: 0,
      },
    });
    await expect(stat(fixture.cacheFile)).resolves.toBeTruthy();
    await expect(stat(fixture.sessionFile)).resolves.toBeTruthy();
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
    expect(result.mode).toBe("applied");
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
