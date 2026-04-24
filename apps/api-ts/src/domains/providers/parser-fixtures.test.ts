import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cp, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../test/fixtures/provider-parser/home",
);

describe("provider parser fixtures", () => {
  const originalHome = process.env.HOME;
  const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
  const originalCodexHome = process.env.CODEX_HOME;
  let tempHome = "";

  beforeEach(async () => {
    tempHome = await mkdtemp(path.join(os.tmpdir(), "threadlens-provider-parser-"));
    await cp(FIXTURE_ROOT, tempHome, { recursive: true });
    process.env.HOME = tempHome;
    process.env.XDG_CONFIG_HOME = path.join(tempHome, ".config");
    process.env.CODEX_HOME = path.join(tempHome, ".codex");
    vi.resetModules();
    const appDataDir = path.join(tempHome, ".config");
    vi.doMock("../../lib/constants.js", () => ({
      HOME_DIR: tempHome,
      APP_DATA_DIR: appDataDir,
      CODEX_HOME: path.join(tempHome, ".codex"),
      BACKUP_ROOT: path.join(tempHome, ".codex", "local_cleanup_backups"),
      CHAT_DIR: path.join(appDataDir, "com.openai.chat"),
      CLAUDE_HOME: path.join(tempHome, ".claude"),
      CLAUDE_PROJECTS_DIR: path.join(tempHome, ".claude", "projects"),
      CLAUDE_TRANSCRIPTS_DIR: path.join(tempHome, ".claude", "transcripts"),
      GEMINI_HOME: path.join(tempHome, ".gemini"),
      GEMINI_HISTORY_DIR: path.join(tempHome, ".gemini", "history"),
      GEMINI_TMP_DIR: path.join(tempHome, ".gemini", "tmp"),
      GEMINI_ANTIGRAVITY_CONVERSATIONS_DIR: path.join(
        tempHome,
        ".gemini",
        "antigravity",
        "conversations",
      ),
      COPILOT_VSCODE_GLOBAL: path.join(
        appDataDir,
        "Code",
        "User",
        "globalStorage",
        "github.copilot-chat",
      ),
      COPILOT_VSCODE_WORKSPACE_STORAGE: path.join(
        appDataDir,
        "Code",
        "User",
        "workspaceStorage",
      ),
      COPILOT_CURSOR_GLOBAL: path.join(
        appDataDir,
        "Cursor",
        "User",
        "globalStorage",
        "github.copilot-chat",
      ),
      COPILOT_CURSOR_WORKSPACE_STORAGE: path.join(
        appDataDir,
        "Cursor",
        "User",
        "workspaceStorage",
      ),
    }));
  });

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (originalXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
    }
    if (originalCodexHome === undefined) {
      delete process.env.CODEX_HOME;
    } else {
      process.env.CODEX_HOME = originalCodexHome;
    }
    vi.resetModules();
    vi.doUnmock("../../lib/constants.js");
    if (tempHome) {
      await rm(tempHome, { recursive: true, force: true });
    }
  });

  it("keeps parser health stable across provider fixtures", async () => {
    const { getProviderParserHealthTs } = await import("./search.js");
    const parserHealth = await getProviderParserHealthTs(undefined, 10, {
      forceRefresh: true,
    });

    expect(parserHealth.summary.providers).toBe(5);
    expect(parserHealth.summary.scanned).toBe(5);
    expect(parserHealth.summary.parse_ok).toBe(4);
    expect(parserHealth.summary.parse_fail).toBe(1);

    const reportByProvider = Object.fromEntries(
      parserHealth.reports.map((report) => [report.provider, report]),
    );

    expect(reportByProvider.codex).toMatchObject({
      scanned: 1,
      parse_ok: 1,
      parse_fail: 0,
    });
    expect(reportByProvider.claude).toMatchObject({
      scanned: 1,
      parse_ok: 1,
      parse_fail: 0,
    });
    expect(reportByProvider.gemini).toMatchObject({
      scanned: 1,
      parse_ok: 0,
      parse_fail: 1,
    });
    expect(reportByProvider.copilot).toMatchObject({
      scanned: 1,
      parse_ok: 1,
      parse_fail: 0,
    });
    expect(reportByProvider.chatgpt).toMatchObject({
      scanned: 1,
      parse_ok: 1,
      parse_fail: 0,
    });
    expect(reportByProvider.gemini?.sample_errors).toEqual([
      expect.objectContaining({
        session_id: "gemini-invalid",
        format: "jsonl",
        error: expect.stringContaining("invalid json line"),
      }),
    ]);
  });

  it("keeps session scan titles stable across provider fixtures", async () => {
    const { getProviderSessionsTs } = await import("./search.js");
    const scan = await getProviderSessionsTs(undefined, 10, {
      forceRefresh: true,
    });

    const rowByProvider = Object.fromEntries(
      scan.rows.map((row) => [row.provider, row]),
    );

    expect(rowByProvider.codex).toMatchObject({
      display_title: "Codex fixture title",
      probe: {
        ok: true,
        format: "jsonl",
        title_source: "jsonl-content",
      },
    });
    expect(rowByProvider.claude).toMatchObject({
      display_title: "Claude fixture renamed title",
      probe: {
        ok: true,
        format: "jsonl",
        title_source: "claude-custom-title",
      },
    });
    expect(rowByProvider.gemini).toMatchObject({
      probe: {
        ok: false,
        format: "jsonl",
        title_source: "jsonl-line",
      },
    });
    expect(rowByProvider.copilot).toMatchObject({
      display_title: "Copilot fixture title",
      probe: {
        ok: true,
        format: "json",
        title_source: "json-content",
      },
    });
    expect(rowByProvider.chatgpt).toMatchObject({
      display_title: "chatgpt-fixture",
      probe: {
        ok: true,
        format: "unknown",
        title_source: "binary-cache-id",
      },
    });
  });
});
