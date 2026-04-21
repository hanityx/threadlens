import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  CLAUDE_PROJECTS_DIR,
  CODEX_HOME,
  COPILOT_VSCODE_GLOBAL,
  GEMINI_TMP_DIR,
  BACKUP_ROOT,
  HOME_DIR,
} from "../../lib/constants.js";
import { deriveProviderBackupRelativePath, runProviderSessionAction } from "./actions.js";

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
  it("rejects custom backup roots outside the user home during preview", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-provider-action-"));
    const filePath = path.join(tempDir, "session.jsonl");
    const outsideHomeBackupRoot = path.join(path.parse(HOME_DIR).root, "tmp", "threadlens-outside-home");
    try {
      await writeFile(filePath, "{}", "utf8");
      const result = await runProviderSessionAction(
        {
          resolveAllowedProviderFilePath: async () => filePath,
          supportsProviderCleanup: () => true,
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
          supportsProviderCleanup: () => true,
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

  it("rejects custom backup roots outside the user home", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "threadlens-provider-action-"));
    const filePath = path.join(tempDir, "session.jsonl");
    const outsideHomeBackupRoot = path.join(path.parse(HOME_DIR).root, "tmp", "threadlens-outside-home");
    try {
      await writeFile(filePath, "{}", "utf8");
      const result = await runProviderSessionAction(
        {
          resolveAllowedProviderFilePath: async () => filePath,
          supportsProviderCleanup: () => true,
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

  it("restores archived Codex sessions back to the source sessions directory", async () => {
    const testRunId = `threadlens-vitest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const archivedDir = path.join(CODEX_HOME, "archived_sessions", "__threadlens-vitest__", testRunId);
    const restoredDir = path.join(CODEX_HOME, "sessions", "__threadlens-vitest__", testRunId);
    const archivedPath = path.join(archivedDir, "session.jsonl");
    const restoredPath = path.join(restoredDir, "session.jsonl");
    const payload = `{"type":"session","id":"${testRunId}"}\n`;
    const deps = {
      resolveAllowedProviderFilePath: async () => archivedPath,
      supportsProviderCleanup: () => true,
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
      supportsProviderCleanup: () => true,
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
      supportsProviderCleanup: () => true,
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
