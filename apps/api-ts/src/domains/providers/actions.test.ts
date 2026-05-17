import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  CLAUDE_PROJECTS_DIR,
  CODEX_HOME,
  COPILOT_VSCODE_GLOBAL,
  GEMINI_TMP_DIR,
  HOME_DIR,
} from "./constants.js";
import { BACKUP_ROOT } from "../recovery/constants.js";
import { deriveProviderBackupRelativePath, runProviderSessionAction } from "./actions.js";
import type { ProviderId, ProviderSessionAction } from "./types.js";

describe("deriveProviderBackupRelativePath", () => {
  it("stores Claude project backups under the provider source instead of the filesystem root", () => {
    const filePath = path.join(
      CLAUDE_PROJECTS_DIR,
      "-workspace-a",
      "session-1.jsonl",
    );

    expect(deriveProviderBackupRelativePath("claude", filePath)).toBe(
      path.join("projects", "-workspace-a", "session-1.jsonl"),
    );
  });

  it("stores Codex session backups under the sessions source bucket", () => {
    const filePath = path.join(CODEX_HOME, "sessions", "project-a", "thread.jsonl");

    expect(deriveProviderBackupRelativePath("codex", filePath)).toBe(
      path.join("sessions", "project-a", "thread.jsonl"),
    );
  });

  it("keeps cleanup backups scoped under cleanup_backups", () => {
    const filePath = path.join(
      BACKUP_ROOT,
      "provider_actions",
      "claude",
      "2026-04-23T00-00-00-000Z-backup_local",
      "projects",
      "foo.jsonl",
    );

    expect(deriveProviderBackupRelativePath("claude", filePath)).toBe(
      path.join(
        "cleanup_backups",
        "2026-04-23T00-00-00-000Z-backup_local",
        "projects",
        "foo.jsonl",
      ),
    );
  });
});

describe("runProviderSessionAction", () => {
  it("uses action-aware provider support before resolving targets", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-provider-action-"));
    const filePath = path.join(tempDir, "session.jsonl");
    try {
      await writeFile(filePath, "{}", "utf8");
      const resolveAllowedProviderFilePath = vi.fn(async () => filePath);
      const deps = {
        resolveAllowedProviderFilePath,
        supportsProviderAction: (
          _provider: ProviderId,
          action: ProviderSessionAction,
        ) => action === "archive_local",
        invalidateProviderCaches: () => undefined,
      };

      const archivePreview = await runProviderSessionAction(
        deps,
        "codex",
        "archive_local",
        [filePath],
        true,
        "",
      );
      expect(archivePreview.ok).toBe(true);
      expect(archivePreview.confirm_token_expected).toMatch(/^PROVIDER-/);
      expect(resolveAllowedProviderFilePath).toHaveBeenCalledTimes(1);

      const deletePreview = await runProviderSessionAction(
        deps,
        "codex",
        "delete_local",
        [filePath],
        true,
        "",
      );
      expect(deletePreview.ok).toBe(false);
      expect(deletePreview.error).toBe("cleanup-disabled-provider");
      expect(deletePreview.confirm_token_expected).toBe("");
      expect(resolveAllowedProviderFilePath).toHaveBeenCalledTimes(1);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects custom backup roots outside the user home during preview", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-provider-action-"));
    const filePath = path.join(tempDir, "session.jsonl");
    const outsideHomeBackupRoot = path.join(path.parse(HOME_DIR).root, "tmp", "threadlens-outside-home");
    try {
      await writeFile(filePath, "{}", "utf8");
      const result = await runProviderSessionAction(
        {
          resolveAllowedProviderFilePath: async () => filePath,
          supportsProviderAction: () => true,
          invalidateProviderCaches: () => undefined,
        },
        "codex",
        "backup_local",
        [filePath],
        true,
        "",
        { backup_root: outsideHomeBackupRoot },
      );

      expect(result.ok).toBe(false);
      expect(result.dry_run).toBe(true);
      expect(result.error).toBe("backup_root_outside_home");
      expect(result.confirm_token_expected).toBe("");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects hidden custom backup roots so exported folders stay visible", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-provider-action-"));
    const filePath = path.join(tempDir, "session.jsonl");
    const hiddenBackupRoot = path.join(HOME_DIR, ".threadlens-hidden-backups");
    try {
      await writeFile(filePath, "{}", "utf8");
      const result = await runProviderSessionAction(
        {
          resolveAllowedProviderFilePath: async () => filePath,
          supportsProviderAction: () => true,
          invalidateProviderCaches: () => undefined,
        },
        "codex",
        "backup_local",
        [filePath],
        false,
        "",
        { backup_root: hiddenBackupRoot },
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("backup_root_hidden");
      expect(result.confirm_token_expected).toBe("");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects custom backup roots that resolve outside the user home", async () => {
    const previousHome = process.env.HOME;
    const previousCodexHome = process.env.CODEX_HOME;
    const previousStateDir = process.env.THREADLENS_STATE_DIR;
    const root = await mkdtemp(path.join(os.tmpdir(), "threadlens-provider-backup-root-"));

    try {
      const homeDir = path.join(root, "home");
      const outsideDir = path.join(root, "outside");
      process.env.HOME = homeDir;
      process.env.CODEX_HOME = path.join(homeDir, ".codex");
      process.env.THREADLENS_STATE_DIR = path.join(root, "state");
      vi.resetModules();

      const constants = await import("./constants.js");
      const { runProviderSessionAction: runAction } = await import("./actions.js");
      const sourceDir = path.join(constants.CODEX_HOME, "sessions", "backup-root-smoke");
      const sourcePath = path.join(sourceDir, "session.jsonl");
      const backupRootLink = path.join(constants.HOME_DIR, "ThreadLens Backups Link");

      await mkdir(sourceDir, { recursive: true });
      await mkdir(outsideDir, { recursive: true });
      await writeFile(sourcePath, "{\"type\":\"session\"}\n", "utf8");
      await symlink(outsideDir, backupRootLink, "dir");

      const result = await runAction(
        {
          resolveAllowedProviderFilePath: async () => sourcePath,
          supportsProviderAction: () => true,
          invalidateProviderCaches: () => undefined,
        },
        "codex",
        "backup_local",
        [sourcePath],
        true,
        "",
        { backup_root: backupRootLink },
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("backup_root_outside_home");
      expect(result.confirm_token_expected).toBe("");
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = previousCodexHome;
      if (previousStateDir === undefined) delete process.env.THREADLENS_STATE_DIR;
      else process.env.THREADLENS_STATE_DIR = previousStateDir;
      vi.resetModules();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not delete provider files when backup destination resolves outside the user home", async () => {
    const previousHome = process.env.HOME;
    const previousCodexHome = process.env.CODEX_HOME;
    const previousStateDir = process.env.THREADLENS_STATE_DIR;
    const root = await mkdtemp(path.join(os.tmpdir(), "threadlens-provider-backup-dest-"));

    try {
      const homeDir = path.join(root, "home");
      const outsideDir = path.join(root, "outside");
      process.env.HOME = homeDir;
      process.env.CODEX_HOME = path.join(homeDir, ".codex");
      process.env.THREADLENS_STATE_DIR = path.join(root, "state");
      vi.resetModules();

      const constants = await import("./constants.js");
      const { runProviderSessionAction: runAction } = await import("./actions.js");
      const sourceDir = path.join(constants.CODEX_HOME, "sessions", "backup-dest-smoke");
      const sourcePath = path.join(sourceDir, "session.jsonl");
      const backupRoot = path.join(constants.HOME_DIR, "ThreadLens Test Backups");
      const providerActionsLink = path.join(backupRoot, "provider_actions");
      const payload = "{\"type\":\"session\",\"id\":\"backup-dest-smoke\"}\n";
      const deps = {
        resolveAllowedProviderFilePath: async () => sourcePath,
        supportsProviderAction: () => true,
        invalidateProviderCaches: () => undefined,
      };

      await mkdir(sourceDir, { recursive: true });
      await mkdir(backupRoot, { recursive: true });
      await mkdir(outsideDir, { recursive: true });
      await writeFile(sourcePath, payload, "utf8");
      await symlink(outsideDir, providerActionsLink, "dir");

      const preview = await runAction(
        deps,
        "codex",
        "delete_local",
        [sourcePath],
        true,
        "",
        { backup_before_delete: true, backup_root: backupRoot },
      );
      expect(preview.ok).toBe(true);
      expect(preview.confirm_token_expected).toMatch(/^PROVIDER-/);

      const result = await runAction(
        deps,
        "codex",
        "delete_local",
        [sourcePath],
        false,
        preview.confirm_token_expected,
        { backup_before_delete: true, backup_root: backupRoot },
      );

      expect(result.ok).toBe(false);
      expect(result.mode).toBe("failed");
      expect(result.applied_count).toBe(0);
      expect(result.failed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ step: "backup_root", error: "backup_root_outside_home" }),
        ]),
      );
      await expect(readFile(sourcePath, "utf8")).resolves.toBe(payload);
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = previousCodexHome;
      if (previousStateDir === undefined) delete process.env.THREADLENS_STATE_DIR;
      else process.env.THREADLENS_STATE_DIR = previousStateDir;
      vi.resetModules();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects custom backup roots outside the user home", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-provider-action-"));
    const filePath = path.join(tempDir, "session.jsonl");
    const outsideHomeBackupRoot = path.join(path.parse(HOME_DIR).root, "tmp", "threadlens-outside-home");
    try {
      await writeFile(filePath, "{}", "utf8");
      const result = await runProviderSessionAction(
        {
          resolveAllowedProviderFilePath: async () => filePath,
          supportsProviderAction: () => true,
          invalidateProviderCaches: () => undefined,
        },
        "codex",
        "backup_local",
        [filePath],
        false,
        "",
        { backup_root: outsideHomeBackupRoot },
      );

      expect(result.ok).toBe(false);
      expect(result.error).toBe("backup_root_outside_home");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("does not delete provider files when backup manifest writing fails", async () => {
    const previousHome = process.env.HOME;
    const previousCodexHome = process.env.CODEX_HOME;
    const previousStateDir = process.env.THREADLENS_STATE_DIR;
    const root = await mkdtemp(path.join(os.tmpdir(), "threadlens-provider-manifest-"));
    const fixedNow = "2026-05-02T00:00:00.000Z";
    const folderName = "2026-05-02T00-00-00-000Z-delete_local";

    try {
      const homeDir = path.join(root, "home");
      process.env.HOME = homeDir;
      process.env.CODEX_HOME = path.join(homeDir, ".codex");
      process.env.THREADLENS_STATE_DIR = path.join(root, "state");
      vi.resetModules();
      vi.doMock("../../lib/utils.js", async (importOriginal) => ({
        ...(await importOriginal<typeof import("../../lib/utils.js")>()),
        nowIsoUtc: () => fixedNow,
      }));

      const constants = await import("./constants.js");
      const { runProviderSessionAction: runAction } = await import("./actions.js");
      const sourceDir = path.join(constants.CODEX_HOME, "sessions", "manifest-smoke");
      const sourcePath = path.join(sourceDir, "session.jsonl");
      const backupRoot = path.join(constants.HOME_DIR, "ThreadLens Test Backups");
      const manifestPath = path.join(
        backupRoot,
        "provider_actions",
        "codex",
        folderName,
        "_manifest.json",
      );
      const payload = "{\"type\":\"session\",\"id\":\"manifest-smoke\"}\n";
      const deps = {
        resolveAllowedProviderFilePath: async () => sourcePath,
        supportsProviderAction: () => true,
        invalidateProviderCaches: () => undefined,
      };

      await mkdir(sourceDir, { recursive: true });
      await mkdir(manifestPath, { recursive: true });
      await writeFile(sourcePath, payload, "utf8");

      const preview = await runAction(
        deps,
        "codex",
        "delete_local",
        [sourcePath],
        true,
        "",
        { backup_before_delete: true, backup_root: backupRoot },
      );
      expect(preview.ok).toBe(true);
      expect(preview.confirm_token_expected).toMatch(/^PROVIDER-/);

      const result = await runAction(
        deps,
        "codex",
        "delete_local",
        [sourcePath],
        false,
        preview.confirm_token_expected,
        { backup_before_delete: true, backup_root: backupRoot },
      );

      expect(result.ok).toBe(false);
      expect(result.mode).toBe("failed");
      expect(result.applied_count).toBe(0);
      expect(result.failed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ file_path: manifestPath, step: "manifest_write" }),
        ]),
      );
      await expect(readFile(sourcePath, "utf8")).resolves.toBe(payload);
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = previousCodexHome;
      if (previousStateDir === undefined) delete process.env.THREADLENS_STATE_DIR;
      else process.env.THREADLENS_STATE_DIR = previousStateDir;
      vi.doUnmock("../../lib/utils.js");
      vi.resetModules();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("restores archived Codex sessions back to the source sessions directory", async () => {
    const testRunId = `threadlens-vitest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const archivedDir = path.join(CODEX_HOME, "archived_sessions", "__threadlens-vitest__", testRunId);
    const restoredDir = path.join(CODEX_HOME, "sessions", "__threadlens-vitest__", testRunId);
    const archivedPath = path.join(archivedDir, "session.jsonl");
    const restoredPath = path.join(restoredDir, "session.jsonl");
    const payload = `{"type":"session","id":"${testRunId}"}\n`;
    const deps = {
      resolveAllowedProviderFilePath: async () => archivedPath,
      supportsProviderAction: () => true,
      invalidateProviderCaches: () => undefined,
    };

    try {
      await rm(archivedDir, { recursive: true, force: true });
      await rm(restoredDir, { recursive: true, force: true });
      await mkdir(archivedDir, { recursive: true });
      await writeFile(archivedPath, payload, "utf8");

      const preview = await runProviderSessionAction(
        deps,
        "codex",
        "unarchive_local",
        [archivedPath],
        true,
        "",
      );

      expect(preview.ok).toBe(true);
      expect(preview.dry_run).toBe(true);
      expect(preview.valid_count).toBe(1);
      expect(preview.confirm_token_expected).toMatch(/^PROVIDER-/);

      const result = await runProviderSessionAction(
        deps,
        "codex",
        "unarchive_local",
        [archivedPath],
        false,
        preview.confirm_token_expected,
      );

      expect(result.ok).toBe(true);
      expect(result.applied_count).toBe(1);
      expect(result.mode).toBe("applied");
      await expect(stat(archivedPath)).rejects.toThrow();
      await expect(readFile(restoredPath, "utf8")).resolves.toBe(payload);
    } finally {
      await rm(archivedDir, { recursive: true, force: true });
      await rm(restoredDir, { recursive: true, force: true });
    }
  });

  it("archives Codex sessions into archived_sessions so the archive view can list them", async () => {
    const testRunId = `threadlens-vitest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const sourceDir = path.join(CODEX_HOME, "sessions", "__threadlens-vitest__", testRunId);
    const archivedDir = path.join(CODEX_HOME, "archived_sessions", "__threadlens-vitest__", testRunId);
    const sourcePath = path.join(sourceDir, "session.jsonl");
    const archivedPath = path.join(archivedDir, "session.jsonl");
    const payload = `{"type":"session","id":"${testRunId}"}\n`;
    const deps = {
      resolveAllowedProviderFilePath: async () => sourcePath,
      supportsProviderAction: () => true,
      invalidateProviderCaches: () => undefined,
    };

    try {
      await rm(sourceDir, { recursive: true, force: true });
      await rm(archivedDir, { recursive: true, force: true });
      await mkdir(sourceDir, { recursive: true });
      await writeFile(sourcePath, payload, "utf8");

      const preview = await runProviderSessionAction(
        deps,
        "codex",
        "archive_local",
        [sourcePath],
        true,
        "",
      );

      expect(preview.ok).toBe(true);
      expect(preview.dry_run).toBe(true);
      expect(preview.valid_count).toBe(1);
      expect(preview.confirm_token_expected).toMatch(/^PROVIDER-/);

      const result = await runProviderSessionAction(
        deps,
        "codex",
        "archive_local",
        [sourcePath],
        false,
        preview.confirm_token_expected,
      );

      expect(result.ok).toBe(true);
      expect(result.applied_count).toBe(1);
      expect(result.mode).toBe("applied");
      expect(result.backup_summary).toBe(null);
      await expect(stat(sourcePath)).rejects.toThrow();
      await expect(readFile(archivedPath, "utf8")).resolves.toBe(payload);
    } finally {
      await rm(sourceDir, { recursive: true, force: true });
      await rm(archivedDir, { recursive: true, force: true });
    }
  });

  it("does not delete Codex sessions when the archive root is a symlink outside the provider tree", async () => {
    const previousHome = process.env.HOME;
    const previousCodexHome = process.env.CODEX_HOME;
    const previousStateDir = process.env.THREADLENS_STATE_DIR;
    const root = await mkdtemp(path.join(os.tmpdir(), "threadlens-provider-archive-root-"));

    try {
      const homeDir = path.join(root, "home");
      const outsideDir = path.join(root, "outside");
      process.env.HOME = homeDir;
      process.env.CODEX_HOME = path.join(homeDir, ".codex");
      process.env.THREADLENS_STATE_DIR = path.join(root, "state");
      vi.resetModules();

      const constants = await import("./constants.js");
      const { runProviderSessionAction: runAction } = await import("./actions.js");
      const sourceDir = path.join(constants.CODEX_HOME, "sessions", "archive-symlink-smoke");
      const sourcePath = path.join(sourceDir, "session.jsonl");
      const archivedRootLink = path.join(constants.CODEX_HOME, "archived_sessions");
      const outsideTargetPath = path.join(outsideDir, "archive-symlink-smoke", "session.jsonl");
      const payload = "{\"type\":\"session\",\"id\":\"archive-symlink-smoke\"}\n";
      const deps = {
        resolveAllowedProviderFilePath: async () => sourcePath,
        supportsProviderAction: () => true,
        invalidateProviderCaches: () => undefined,
      };

      await mkdir(sourceDir, { recursive: true });
      await mkdir(outsideDir, { recursive: true });
      await writeFile(sourcePath, payload, "utf8");
      await symlink(outsideDir, archivedRootLink, "dir");

      const preview = await runAction(
        deps,
        "codex",
        "archive_local",
        [sourcePath],
        true,
        "",
      );
      expect(preview.ok).toBe(true);
      expect(preview.confirm_token_expected).toMatch(/^PROVIDER-/);

      const result = await runAction(
        deps,
        "codex",
        "archive_local",
        [sourcePath],
        false,
        preview.confirm_token_expected,
      );

      expect(result.ok).toBe(false);
      expect(result.mode).toBe("failed");
      expect(result.applied_count).toBe(0);
      expect(result.failed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            step: "archive_local",
            error: "unsafe-archived-session-target",
          }),
        ]),
      );
      await expect(readFile(sourcePath, "utf8")).resolves.toBe(payload);
      await expect(stat(outsideTargetPath)).rejects.toThrow();
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = previousCodexHome;
      if (previousStateDir === undefined) delete process.env.THREADLENS_STATE_DIR;
      else process.env.THREADLENS_STATE_DIR = previousStateDir;
      vi.resetModules();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not restore archived Codex sessions through a symlinked sessions subdirectory", async () => {
    const previousHome = process.env.HOME;
    const previousCodexHome = process.env.CODEX_HOME;
    const previousStateDir = process.env.THREADLENS_STATE_DIR;
    const root = await mkdtemp(path.join(os.tmpdir(), "threadlens-provider-restore-root-"));

    try {
      const homeDir = path.join(root, "home");
      const outsideDir = path.join(root, "outside");
      process.env.HOME = homeDir;
      process.env.CODEX_HOME = path.join(homeDir, ".codex");
      process.env.THREADLENS_STATE_DIR = path.join(root, "state");
      vi.resetModules();

      const constants = await import("./constants.js");
      const { runProviderSessionAction: runAction } = await import("./actions.js");
      const archivedDir = path.join(constants.CODEX_HOME, "archived_sessions", "restore-symlink-smoke");
      const archivedPath = path.join(archivedDir, "session.jsonl");
      const sessionsRoot = path.join(constants.CODEX_HOME, "sessions");
      const restoreLink = path.join(sessionsRoot, "restore-symlink-smoke");
      const outsideTargetPath = path.join(outsideDir, "session.jsonl");
      const payload = "{\"type\":\"session\",\"id\":\"restore-symlink-smoke\"}\n";
      const deps = {
        resolveAllowedProviderFilePath: async () => archivedPath,
        supportsProviderAction: () => true,
        invalidateProviderCaches: () => undefined,
      };

      await mkdir(archivedDir, { recursive: true });
      await mkdir(sessionsRoot, { recursive: true });
      await mkdir(outsideDir, { recursive: true });
      await writeFile(archivedPath, payload, "utf8");
      await symlink(outsideDir, restoreLink, "dir");

      const preview = await runAction(
        deps,
        "codex",
        "unarchive_local",
        [archivedPath],
        true,
        "",
      );
      expect(preview.ok).toBe(true);
      expect(preview.confirm_token_expected).toMatch(/^PROVIDER-/);

      const result = await runAction(
        deps,
        "codex",
        "unarchive_local",
        [archivedPath],
        false,
        preview.confirm_token_expected,
      );

      expect(result.ok).toBe(false);
      expect(result.mode).toBe("failed");
      expect(result.applied_count).toBe(0);
      expect(result.failed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            step: "unarchive_local",
            error: "unsafe-archived-session-target",
          }),
        ]),
      );
      await expect(readFile(archivedPath, "utf8")).resolves.toBe(payload);
      await expect(stat(outsideTargetPath)).rejects.toThrow();
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = previousCodexHome;
      if (previousStateDir === undefined) delete process.env.THREADLENS_STATE_DIR;
      else process.env.THREADLENS_STATE_DIR = previousStateDir;
      vi.resetModules();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not archive Codex sessions when backup-before-delete copy fails", async () => {
    const previousHome = process.env.HOME;
    const previousCodexHome = process.env.CODEX_HOME;
    const previousStateDir = process.env.THREADLENS_STATE_DIR;
    const root = await mkdtemp(path.join(os.tmpdir(), "threadlens-provider-archive-backup-"));
    const fixedNow = "2026-05-14T00:00:00.000Z";
    const folderName = "2026-05-14T00-00-00-000Z-archive_local";

    try {
      const homeDir = path.join(root, "home");
      process.env.HOME = homeDir;
      process.env.CODEX_HOME = path.join(homeDir, ".codex");
      process.env.THREADLENS_STATE_DIR = path.join(root, "state");
      vi.resetModules();
      vi.doMock("../../lib/utils.js", async (importOriginal) => ({
        ...(await importOriginal<typeof import("../../lib/utils.js")>()),
        nowIsoUtc: () => fixedNow,
      }));

      const constants = await import("./constants.js");
      const { runProviderSessionAction: runAction } = await import("./actions.js");
      const sourceDir = path.join(constants.CODEX_HOME, "sessions", "archive-backup-failure");
      const sourcePath = path.join(sourceDir, "session.jsonl");
      const archivedPath = path.join(constants.CODEX_HOME, "archived_sessions", "archive-backup-failure", "session.jsonl");
      const backupRoot = path.join(constants.HOME_DIR, "ThreadLens Test Backups");
      const conflictingBackupTarget = path.join(
        backupRoot,
        "provider_actions",
        "codex",
        folderName,
        "sessions",
        "archive-backup-failure",
        "session.jsonl",
      );
      const payload = "{\"type\":\"session\",\"id\":\"archive-backup-failure\"}\n";
      const deps = {
        resolveAllowedProviderFilePath: async () => sourcePath,
        supportsProviderAction: () => true,
        invalidateProviderCaches: () => undefined,
      };

      await mkdir(sourceDir, { recursive: true });
      await mkdir(conflictingBackupTarget, { recursive: true });
      await writeFile(sourcePath, payload, "utf8");

      const preview = await runAction(
        deps,
        "codex",
        "archive_local",
        [sourcePath],
        true,
        "",
        { backup_before_delete: true, backup_root: backupRoot },
      );
      expect(preview.ok).toBe(true);
      expect(preview.confirm_token_expected).toMatch(/^PROVIDER-/);

      const result = await runAction(
        deps,
        "codex",
        "archive_local",
        [sourcePath],
        false,
        preview.confirm_token_expected,
        { backup_before_delete: true, backup_root: backupRoot },
      );

      expect(result.ok).toBe(false);
      expect(result.mode).toBe("failed");
      expect(result.applied_count).toBe(0);
      expect(result.failed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ step: "archive_local:backup_copy" }),
        ]),
      );
      await expect(readFile(sourcePath, "utf8")).resolves.toBe(payload);
      await expect(stat(archivedPath)).rejects.toThrow();
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = previousCodexHome;
      if (previousStateDir === undefined) delete process.env.THREADLENS_STATE_DIR;
      else process.env.THREADLENS_STATE_DIR = previousStateDir;
      vi.doUnmock("../../lib/utils.js");
      vi.resetModules();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not restore archived Codex sessions when backup-before-delete copy fails", async () => {
    const previousHome = process.env.HOME;
    const previousCodexHome = process.env.CODEX_HOME;
    const previousStateDir = process.env.THREADLENS_STATE_DIR;
    const root = await mkdtemp(path.join(os.tmpdir(), "threadlens-provider-unarchive-backup-"));
    const fixedNow = "2026-05-14T00:00:00.000Z";
    const folderName = "2026-05-14T00-00-00-000Z-unarchive_local";

    try {
      const homeDir = path.join(root, "home");
      process.env.HOME = homeDir;
      process.env.CODEX_HOME = path.join(homeDir, ".codex");
      process.env.THREADLENS_STATE_DIR = path.join(root, "state");
      vi.resetModules();
      vi.doMock("../../lib/utils.js", async (importOriginal) => ({
        ...(await importOriginal<typeof import("../../lib/utils.js")>()),
        nowIsoUtc: () => fixedNow,
      }));

      const constants = await import("./constants.js");
      const { runProviderSessionAction: runAction } = await import("./actions.js");
      const archivedDir = path.join(constants.CODEX_HOME, "archived_sessions", "unarchive-backup-failure");
      const archivedPath = path.join(archivedDir, "session.jsonl");
      const restoredPath = path.join(constants.CODEX_HOME, "sessions", "unarchive-backup-failure", "session.jsonl");
      const backupRoot = path.join(constants.HOME_DIR, "ThreadLens Test Backups");
      const conflictingBackupTarget = path.join(
        backupRoot,
        "provider_actions",
        "codex",
        folderName,
        "archived_sessions",
        "unarchive-backup-failure",
        "session.jsonl",
      );
      const payload = "{\"type\":\"session\",\"id\":\"unarchive-backup-failure\"}\n";
      const deps = {
        resolveAllowedProviderFilePath: async () => archivedPath,
        supportsProviderAction: () => true,
        invalidateProviderCaches: () => undefined,
      };

      await mkdir(archivedDir, { recursive: true });
      await mkdir(conflictingBackupTarget, { recursive: true });
      await writeFile(archivedPath, payload, "utf8");

      const preview = await runAction(
        deps,
        "codex",
        "unarchive_local",
        [archivedPath],
        true,
        "",
        { backup_before_delete: true, backup_root: backupRoot },
      );
      expect(preview.ok).toBe(true);
      expect(preview.confirm_token_expected).toMatch(/^PROVIDER-/);

      const result = await runAction(
        deps,
        "codex",
        "unarchive_local",
        [archivedPath],
        false,
        preview.confirm_token_expected,
        { backup_before_delete: true, backup_root: backupRoot },
      );

      expect(result.ok).toBe(false);
      expect(result.mode).toBe("failed");
      expect(result.applied_count).toBe(0);
      expect(result.failed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ step: "unarchive_local:backup_copy" }),
        ]),
      );
      await expect(readFile(archivedPath, "utf8")).resolves.toBe(payload);
      await expect(stat(restoredPath)).rejects.toThrow();
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = previousCodexHome;
      if (previousStateDir === undefined) delete process.env.THREADLENS_STATE_DIR;
      else process.env.THREADLENS_STATE_DIR = previousStateDir;
      vi.doUnmock("../../lib/utils.js");
      vi.resetModules();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("archives and restores Codex sessions when safe paths are realpath-normalized", async () => {
    const previousHome = process.env.HOME;
    const previousCodexHome = process.env.CODEX_HOME;
    const previousStateDir = process.env.THREADLENS_STATE_DIR;
    const root = await mkdtemp(path.join("/tmp", "threadlens-provider-realpath-"));

    try {
      const homeDir = path.join(root, "home");
      process.env.HOME = homeDir;
      process.env.CODEX_HOME = path.join(homeDir, ".codex");
      process.env.THREADLENS_STATE_DIR = path.join(root, "state");
      vi.resetModules();

      const constants = await import("./constants.js");
      const { runProviderSessionAction: runAction } = await import("./actions.js");

      const sourceDir = path.join(constants.CODEX_HOME, "sessions", "realpath-smoke");
      const archivedDir = path.join(constants.CODEX_HOME, "archived_sessions", "realpath-smoke");
      const sourcePath = path.join(sourceDir, "session.jsonl");
      const archivedPath = path.join(archivedDir, "session.jsonl");
      const payload = "{\"type\":\"session\",\"id\":\"realpath-smoke\"}\n";
      const deps = {
        resolveAllowedProviderFilePath: async (_provider: "codex", filePath: string) => realpath(filePath),
        supportsProviderAction: () => true,
        invalidateProviderCaches: () => undefined,
      };

      await mkdir(sourceDir, { recursive: true });
      await writeFile(sourcePath, payload, "utf8");

      const preview = await runAction(
        deps,
        "codex",
        "archive_local",
        [sourcePath],
        true,
        "",
      );
      expect(preview.ok).toBe(true);
      expect(preview.confirm_token_expected).toMatch(/^PROVIDER-/);

      const archiveResult = await runAction(
        deps,
        "codex",
        "archive_local",
        [sourcePath],
        false,
        preview.confirm_token_expected,
      );
      expect(archiveResult.ok).toBe(true);
      expect(archiveResult.applied_count).toBe(1);
      await expect(stat(sourcePath)).rejects.toThrow();
      await expect(readFile(archivedPath, "utf8")).resolves.toBe(payload);

      const unarchivePreview = await runAction(
        deps,
        "codex",
        "unarchive_local",
        [archivedPath],
        true,
        "",
      );
      expect(unarchivePreview.ok).toBe(true);
      expect(unarchivePreview.confirm_token_expected).toMatch(/^PROVIDER-/);

      const unarchiveResult = await runAction(
        deps,
        "codex",
        "unarchive_local",
        [archivedPath],
        false,
        unarchivePreview.confirm_token_expected,
      );
      expect(unarchiveResult.ok).toBe(true);
      expect(unarchiveResult.applied_count).toBe(1);
      await expect(stat(archivedPath)).rejects.toThrow();
      await expect(readFile(sourcePath, "utf8")).resolves.toBe(payload);
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      if (previousCodexHome === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = previousCodexHome;
      if (previousStateDir === undefined) delete process.env.THREADLENS_STATE_DIR;
      else process.env.THREADLENS_STATE_DIR = previousStateDir;
      vi.resetModules();
      await rm(root, { recursive: true, force: true });
    }
  });

  it.each([
    {
      provider: "claude" as const,
      source: "projects",
      sourceRoot: CLAUDE_PROJECTS_DIR,
      fileName: "session.jsonl",
      payload: "{\"type\":\"message\",\"message\":{\"role\":\"user\",\"content\":\"smoke\"}}\n",
    },
    {
      provider: "gemini" as const,
      source: "tmp",
      sourceRoot: GEMINI_TMP_DIR,
      fileName: "session.jsonl",
      payload: "{\"role\":\"user\",\"parts\":[{\"text\":\"smoke\"}]}\n",
    },
    {
      provider: "copilot" as const,
      source: "vscode_global",
      sourceRoot: COPILOT_VSCODE_GLOBAL,
      fileName: "session.json",
      payload: "{\"messages\":[{\"role\":\"user\",\"content\":\"smoke\"}]}\n",
    },
  ])("archives and restores $provider session files", async ({ provider, source, sourceRoot, fileName, payload }) => {
    const testRunId = `threadlens-vitest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const sourceDir = path.join(sourceRoot, "__threadlens-vitest__", testRunId);
    const archivedDir = path.join(CODEX_HOME, "archived_sessions", provider, source, "__threadlens-vitest__", testRunId);
    const sourcePath = path.join(sourceDir, fileName);
    const archivedPath = path.join(archivedDir, fileName);
    const deps = {
      resolveAllowedProviderFilePath: async (_provider: typeof provider, filePath: string) => filePath,
      supportsProviderAction: () => true,
      invalidateProviderCaches: () => undefined,
    };

    try {
      await rm(sourceDir, { recursive: true, force: true });
      await rm(archivedDir, { recursive: true, force: true });
      await mkdir(sourceDir, { recursive: true });
      await writeFile(sourcePath, payload, "utf8");

      const preview = await runProviderSessionAction(
        deps,
        provider,
        "archive_local",
        [sourcePath],
        true,
        "",
      );
      expect(preview.ok).toBe(true);
      expect(preview.confirm_token_expected).toMatch(/^PROVIDER-/);

      const archiveResult = await runProviderSessionAction(
        deps,
        provider,
        "archive_local",
        [sourcePath],
        false,
        preview.confirm_token_expected,
      );
      expect(archiveResult.ok).toBe(true);
      expect(archiveResult.applied_count).toBe(1);
      await expect(stat(sourcePath)).rejects.toThrow();
      await expect(readFile(archivedPath, "utf8")).resolves.toBe(payload);

      const unarchivePreview = await runProviderSessionAction(
        deps,
        provider,
        "unarchive_local",
        [archivedPath],
        true,
        "",
      );
      expect(unarchivePreview.ok).toBe(true);
      expect(unarchivePreview.confirm_token_expected).toMatch(/^PROVIDER-/);

      const unarchiveResult = await runProviderSessionAction(
        deps,
        provider,
        "unarchive_local",
        [archivedPath],
        false,
        unarchivePreview.confirm_token_expected,
      );
      expect(unarchiveResult.ok).toBe(true);
      expect(unarchiveResult.applied_count).toBe(1);
      await expect(stat(archivedPath)).rejects.toThrow();
      await expect(readFile(sourcePath, "utf8")).resolves.toBe(payload);
    } finally {
      await rm(sourceDir, { recursive: true, force: true });
      await rm(archivedDir, { recursive: true, force: true });
    }
  });
});
