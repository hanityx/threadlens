import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function writeTextFile(filePath: string, text: string): Promise<number> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, text, "utf-8");
  return Number((await stat(filePath)).size);
}

async function writeBinaryFile(filePath: string, size: number): Promise<number> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.alloc(size, 7));
  return Number((await stat(filePath)).size);
}

describe("provider session total bytes", () => {
  const originalHome = process.env.HOME;
  const originalCodexHome = process.env.CODEX_HOME;
  const originalProjectRoot = process.env.THREADLENS_PROJECT_ROOT;
  let tempRoot = "";

  beforeEach(async () => {
    tempRoot = await mkdtemp(
      path.join(os.tmpdir(), "threadlens-provider-session-totals-"),
    );
    process.env.HOME = tempRoot;
    process.env.CODEX_HOME = path.join(tempRoot, ".codex-cli");
    process.env.THREADLENS_PROJECT_ROOT = tempRoot;
    vi.resetModules();
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (originalCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = originalCodexHome;
    }
    if (originalProjectRoot === undefined) {
      delete process.env.THREADLENS_PROJECT_ROOT;
    } else {
      process.env.THREADLENS_PROJECT_ROOT = originalProjectRoot;
    }
    vi.resetModules();
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("counts every codex session file across live, archive, recovered, cwd backups, and cleanup backups", async () => {
    const codexHome = process.env.CODEX_HOME!;
    let expectedTotal = 0;

    expectedTotal += await writeTextFile(
      path.join(codexHome, "sessions", "rollout-live.jsonl"),
      '{"type":"message","role":"user","content":"live"}\n',
    );
    expectedTotal += await writeTextFile(
      path.join(codexHome, "archived_sessions", "rollout-archived.jsonl"),
      '{"type":"message","role":"assistant","content":"archived"}\n',
    );
    expectedTotal += await writeTextFile(
      path.join(codexHome, "recovered-sessions", "rollout-recovered.jsonl"),
      '{"type":"message","role":"assistant","content":"recovered"}\n',
    );
    expectedTotal += await writeTextFile(
      path.join(
        codexHome,
        "local_cleanup_backups",
        "provider_actions",
        "codex",
        "2026-04-21T00-00-00-000Z-backup_local",
        "Users",
        "example-user",
        ".codex-cli",
        "sessions",
        "rollout-cleanup-backup.jsonl",
      ),
      '{"type":"message","role":"assistant","content":"cleanup backup"}\n',
    );
    await writeTextFile(
      path.join(
        codexHome,
        "local_cleanup_backups",
        "provider_actions",
        "codex",
        "2026-04-21T00-00-00-000Z-backup_local",
        "_manifest.json",
      ),
      '{"meta":"not a session"}\n',
    );

    for (let i = 0; i < 81; i += 1) {
      expectedTotal += await writeTextFile(
        path.join(
          codexHome,
          "jsonl-cwd-backups-20260421-000000",
          `rollout-cwd-backup-${String(i).padStart(3, "0")}.jsonl`,
        ),
        `{"type":"message","role":"assistant","content":"cwd backup ${i}"}\n`,
      );
    }

    await writeTextFile(
      path.join(codexHome, "log", "codex-tui.log"),
      "this is not a session log\n",
    );
    await writeBinaryFile(path.join(codexHome, "logs_2.sqlite"), 4096);

    const { getProviderSessionsTs } = await import("./search.js");
    const payload = await getProviderSessionsTs("codex", 1, {
      forceRefresh: true,
    });

    expect(payload.summary.rows).toBe(1);
    expect(payload.providers[0]?.truncated).toBe(true);
    expect(payload.providers[0]?.total_bytes).toBe(expectedTotal);
  });

  it("counts claude session backups but excludes backup manifests", async () => {
    const claudeHome = path.join(tempRoot, ".claude");
    const codexHome = process.env.CODEX_HOME!;
    let expectedTotal = 0;

    expectedTotal += await writeTextFile(
      path.join(claudeHome, "projects", "project-a", "session-a.jsonl"),
      '{"message":{"role":"user","content":"claude project"}}\n',
    );
    expectedTotal += await writeTextFile(
      path.join(claudeHome, "transcripts", "session-b.json"),
      '{"role":"assistant","content":"claude transcript"}\n',
    );
    expectedTotal += await writeTextFile(
      path.join(
        codexHome,
        "local_cleanup_backups",
        "provider_actions",
        "claude",
        "2026-04-21T00-00-00-000Z-archive_local",
        "Users",
        "example-user",
        ".claude",
        "transcripts",
        "session-backup.jsonl",
      ),
      '{"message":{"role":"assistant","content":"claude backup"}}\n',
    );
    await writeTextFile(
      path.join(
        codexHome,
        "local_cleanup_backups",
        "provider_actions",
        "claude",
        "2026-04-21T00-00-00-000Z-archive_local",
        "_manifest.json",
      ),
      '{"meta":"skip me"}\n',
    );

    const { getProviderSessionsTs } = await import("./search.js");
    const payload = await getProviderSessionsTs("claude", 1, {
      forceRefresh: true,
    });

    expect(payload.providers[0]?.total_bytes).toBe(expectedTotal);
  });

  it("counts gemini session backups and pb conversations but excludes backup manifests", async () => {
    const geminiHome = path.join(tempRoot, ".gemini");
    const codexHome = process.env.CODEX_HOME!;
    let expectedTotal = 0;

    expectedTotal += await writeTextFile(
      path.join(geminiHome, "tmp", "workspace", "session-a.json"),
      '{"role":"user","content":"gemini tmp"}\n',
    );
    expectedTotal += await writeTextFile(
      path.join(geminiHome, "history", "session-b.jsonl"),
      '{"role":"assistant","content":"gemini history"}\n',
    );
    expectedTotal += await writeBinaryFile(
      path.join(
        geminiHome,
        "antigravity",
        "conversations",
        "session-c.pb",
      ),
      1536,
    );
    expectedTotal += await writeTextFile(
      path.join(
        codexHome,
        "local_cleanup_backups",
        "provider_actions",
        "gemini",
        "2026-04-21T00-00-00-000Z-delete_local",
        "Users",
        "example-user",
        ".gemini",
        "tmp",
        "session-backup.json",
      ),
      '{"role":"assistant","content":"gemini backup"}\n',
    );
    await writeTextFile(
      path.join(
        codexHome,
        "local_cleanup_backups",
        "provider_actions",
        "gemini",
        "2026-04-21T00-00-00-000Z-delete_local",
        "_manifest.json",
      ),
      '{"meta":"skip me"}\n',
    );

    const { getProviderSessionsTs } = await import("./search.js");
    const payload = await getProviderSessionsTs("gemini", 1, {
      forceRefresh: true,
    });

    expect(payload.providers[0]?.total_bytes).toBe(expectedTotal);
  });
});
