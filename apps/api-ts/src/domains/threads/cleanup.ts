import { createHash } from "node:crypto";
import { copyFile, mkdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { BACKUP_ROOT, CHAT_DIR, CODEX_HOME } from "../../lib/constants.js";
import { nowIsoUtc } from "../../lib/utils.js";
import { analyzeDeleteImpactTs } from "./impact.js";
import { findThreadArtifactsTs } from "./forensics.js";
import { cleanGlobalStateRefsTs } from "./state.js";
import { getOverviewTs } from "./overview.js";
import { normalizeSafeThreadIds } from "./thread-id.js";

type CleanupArtifact = {
  kind: string;
  thread_id: string;
  path: string;
};

type CleanupOptions = {
  delete_cache?: boolean;
  delete_session_logs?: boolean;
  clean_state_refs?: boolean;
};

type CleanupBackupRow = {
  thread_id?: string;
  source?: string;
  session_source?: string;
  local_cache_paths?: string[];
};

type CleanupExecOptions = {
  dryRun?: boolean;
  confirmToken?: string;
  options?: CleanupOptions;
  backupPaths?: typeof backupPathsTs;
  roots?: {
    chatDir?: string;
    codexHome?: string;
    backupRoot?: string;
    stateFilePath?: string;
  };
};

type BackupCleanupOptions = {
  backupRoots?: string[];
};

function normalizeCleanupOptions(options?: CleanupOptions) {
  return {
    delete_cache: options?.delete_cache !== false,
    delete_session_logs: options?.delete_session_logs !== false,
    clean_state_refs: options?.clean_state_refs !== false,
  };
}

export function buildCleanupConfirmTokenTs(
  threadIds: string[],
  targetPaths: string[],
  options?: CleanupOptions,
): string {
  const normalizedOptions = normalizeCleanupOptions(options);
  const payload = {
    ids: Array.from(new Set(threadIds.map((item) => String(item || "").trim()).filter(Boolean))).sort(),
    paths: Array.from(new Set(targetPaths.map((item) => String(item || "").trim()).filter(Boolean))).sort(),
    options: normalizedOptions,
  };
  const raw = JSON.stringify(payload);
  const digest = createHash("sha256").update(raw).digest("hex").slice(0, 12).toUpperCase();
  return `DEL-${digest}`;
}

async function backupPathsTs(pathsToBackup: string[], backupRoot = BACKUP_ROOT) {
  const stamp = nowIsoUtc().replace(/[:.]/g, "-");
  const destination = path.join(backupRoot, stamp);
  await mkdir(destination, { recursive: true });
  const copied: string[] = [];
  const failed: Array<{ path: string; error: string }> = [];
  for (const sourcePath of pathsToBackup) {
    const resolved = path.resolve(sourcePath);
    try {
      const fileStat = await stat(resolved);
      if (!fileStat.isFile()) continue;
      const relativeTarget = resolved.replace(/^([A-Za-z]:)?[\\/]+/, "");
      const targetPath = path.join(destination, relativeTarget);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await copyFile(resolved, targetPath);
      copied.push(targetPath);
    } catch (error) {
      failed.push({ path: resolved, error: String(error) });
    }
  }
  return {
    backup_dir: destination,
    copied_count: copied.length,
    copied,
    failed,
  };
}

function selectCleanupTargets(
  artifacts: CleanupArtifact[],
  options?: CleanupOptions,
): CleanupArtifact[] {
  const normalized = normalizeCleanupOptions(options);
  return artifacts.filter((artifact) => {
    if ((artifact.kind === "chat-cache" || artifact.kind === "project-cache") && normalized.delete_cache) {
      return true;
    }
    if (
      (artifact.kind === "session-log" || artifact.kind === "archived-session-log") &&
      normalized.delete_session_logs
    ) {
      return true;
    }
    return false;
  });
}

export async function executeLocalCleanupTs(
  threadIds: string[],
  execOptions?: CleanupExecOptions,
) {
  const { ids, invalid: invalid_ids } = normalizeSafeThreadIds(threadIds);
  const options = normalizeCleanupOptions(execOptions?.options);
  const roots = {
    chatDir: execOptions?.roots?.chatDir ?? CHAT_DIR,
    codexHome: execOptions?.roots?.codexHome ?? CODEX_HOME,
    backupRoot: execOptions?.roots?.backupRoot ?? BACKUP_ROOT,
    stateFilePath: execOptions?.roots?.stateFilePath,
  };
  const dryRun = execOptions?.dryRun !== false;
  const confirmToken = String(execOptions?.confirmToken ?? "").trim();

  if (invalid_ids.length > 0) {
    return {
      ok: false,
      mode: dryRun ? "dry-run" : "failed",
      error: "invalid-thread-id",
      invalid_ids,
      requested_ids: ids.length + invalid_ids.length,
      target_file_count: 0,
      deleted_file_count: 0,
      failed: [],
      failure_summary: {
        failed_count: invalid_ids.length,
        partial_failure: false,
      },
      state_result: { changed: false, removed: { titles: 0, order: 0, pinned: 0 } },
      backup: { backup_dir: "", copied_count: 0, failed: [] },
      targets: [],
    };
  }

  const artifacts = await findThreadArtifactsTs(ids, {
    chatDir: roots.chatDir,
    codexHome: roots.codexHome,
  });
  const targets = selectCleanupTargets(artifacts, options);
  const targetPaths = Array.from(new Set(targets.map((artifact) => artifact.path))).sort();
  const stateResult = options.clean_state_refs
    ? await cleanGlobalStateRefsTs(ids, {
        dryRun: true,
        stateFilePath: roots.stateFilePath,
      })
    : { changed: false, removed: { titles: 0, order: 0, pinned: 0 } };
  const confirm_token_expected = buildCleanupConfirmTokenTs(ids, targetPaths, options);
  const backup = { backup_dir: "", copied_count: 0 };

  if (dryRun) {
    return {
      ok: true,
      mode: "dry-run",
      requested_ids: ids.length,
      target_file_count: targetPaths.length,
      state_result: stateResult,
      backup,
      targets,
      confirm_token_expected,
      confirm_help: "Enter the token above before running cleanup.",
    };
  }

  if (confirmToken !== confirm_token_expected) {
    return {
      ok: false,
      mode: "failed",
      error: "confirmation token mismatch",
      requested_ids: ids.length,
      target_file_count: targetPaths.length,
      state_result: stateResult,
      targets,
      confirm_token_expected,
      confirm_help: "Enter the token from preview and run it again.",
    };
  }

  const backupTargets = [...targetPaths];
  if (
    options.clean_state_refs &&
    stateResult.changed &&
    "path" in stateResult &&
    typeof stateResult.path === "string"
  ) {
    backupTargets.push(stateResult.path);
  }
  const backupInfo = await (execOptions?.backupPaths ?? backupPathsTs)(
    backupTargets,
    roots.backupRoot,
  );
  const backupFailed = Array.isArray(backupInfo.failed) ? backupInfo.failed : [];
  if (backupFailed.length > 0) {
    return {
      ok: false,
      mode: "failed",
      error: "backup-failed-before-delete",
      requested_ids: ids.length,
      target_file_count: targetPaths.length,
      deleted_file_count: 0,
      failed: [],
      failure_summary: {
        failed_count: backupFailed.length,
        partial_failure: false,
        backup_failed_count: backupFailed.length,
        delete_failed_count: 0,
      },
      state_result: stateResult,
      backup: {
        backup_dir: backupInfo.backup_dir,
        copied_count: backupInfo.copied_count,
        failed: backupFailed,
      },
      targets,
      confirm_token_expected,
    };
  }

  let deleted_file_count = 0;
  const failed: Array<{ path: string; error: string }> = [];
  for (const filePath of targetPaths) {
    try {
      await unlink(filePath);
      deleted_file_count += 1;
    } catch (error) {
      failed.push({ path: filePath, error: String(error) });
    }
  }
  const executedStateResult = options.clean_state_refs
    ? await cleanGlobalStateRefsTs(ids, {
        dryRun: false,
        stateFilePath: roots.stateFilePath,
      })
    : stateResult;
  const failedCount = failed.length;
  const changed = deleted_file_count > 0 || Boolean(executedStateResult.changed);
  const mode = failedCount === 0 ? "applied" : changed ? "partial" : "failed";

  return {
    ok: failedCount === 0,
    mode,
    requested_ids: ids.length,
    target_file_count: targetPaths.length,
    deleted_file_count,
    failed,
    failure_summary: {
      failed_count: failedCount,
      partial_failure: failedCount > 0 && changed,
      backup_failed_count: 0,
      delete_failed_count: failed.length,
    },
    state_result: executedStateResult,
    backup: {
      backup_dir: backupInfo.backup_dir,
      copied_count: backupInfo.copied_count,
      failed: [],
    },
    targets,
    confirm_token_expected,
  };
}

function isPathInsideRoot(filePath: string, rootPath: string): boolean {
  const resolvedFile = path.resolve(filePath);
  const resolvedRoot = path.resolve(rootPath);
  return resolvedFile === resolvedRoot || resolvedFile.startsWith(`${resolvedRoot}${path.sep}`);
}

function defaultCleanupBackupRoots(): string[] {
  return [
    path.join(BACKUP_ROOT, "provider_actions"),
    path.join(CODEX_HOME, "local_cleanup_backups", "provider_actions"),
  ];
}

function isCleanupBackupPath(filePath: string, backupRoots = defaultCleanupBackupRoots()): boolean {
  const resolved = path.resolve(filePath);
  return backupRoots.some((root) => isPathInsideRoot(resolved, root));
}

export async function executeBackupCleanupTs(threadIds: string[], options?: BackupCleanupOptions) {
  const { ids, invalid: invalid_ids } = normalizeSafeThreadIds(threadIds);
  if (invalid_ids.length > 0) {
    return {
      ok: false,
      mode: "failed",
      error: "invalid-thread-id",
      invalid_ids,
      requested_ids: ids.length + invalid_ids.length,
      target_file_count: 0,
      deleted_file_count: 0,
      failed: [],
      backup: { backup_dir: "", copied_count: 0 },
      targets: [],
    };
  }
  const idSet = new Set(ids);
  const overview = await getOverviewTs({ includeThreads: true, forceRefresh: true });
  const rows = Array.isArray((overview as Record<string, unknown>).threads)
    ? ((overview as Record<string, unknown>).threads as CleanupBackupRow[])
    : [];
  const targetRows = rows.filter((row) => {
    const rowThreadId = String(row.thread_id ?? "").trim();
    const source = String(row.source ?? row.session_source ?? "").trim();
    return idSet.has(rowThreadId) && source === "cleanup_backups";
  });
  const targetEntries = targetRows.flatMap((row) =>
    (Array.isArray(row.local_cache_paths) ? row.local_cache_paths : [])
      .map((item) => ({
        thread_id: String(row.thread_id ?? "").trim(),
        path: String(item || "").trim(),
      }))
      .filter((item) => item.path && isCleanupBackupPath(item.path, options?.backupRoots)),
  );
  const threadIdByPath = new Map(targetEntries.map((entry) => [path.resolve(entry.path), entry.thread_id]));
  const targetPaths = Array.from(new Set(targetEntries.map((entry) => path.resolve(entry.path)))).sort();
  if (ids.length > 0 && targetPaths.length === 0) {
    return {
      ok: false,
      mode: "execute",
      error: "cleanup-backups-no-targets",
      requested_ids: ids.length,
      target_file_count: 0,
      deleted_file_count: 0,
      failed: [],
      backup: { backup_dir: "", copied_count: 0 },
      targets: [],
    };
  }

  let deleted_file_count = 0;
  const targets: CleanupArtifact[] = [];
  const failed: Array<{ path: string; error: string }> = [];
  for (const filePath of targetPaths) {
    const resolved = path.resolve(filePath);
    try {
      const fileStat = await stat(resolved);
      if (!fileStat.isFile()) continue;
      await unlink(resolved);
      deleted_file_count += 1;
      targets.push({ kind: "cleanup-backup", thread_id: threadIdByPath.get(resolved) ?? "", path: resolved });
    } catch (error) {
      failed.push({ path: resolved, error: String(error) });
    }
  }
  const failedCount = failed.length;
  const mode = failedCount === 0 ? "execute" : deleted_file_count > 0 ? "partial" : "failed";

  return {
    ok: failedCount === 0,
    mode,
    requested_ids: ids.length,
    target_file_count: targetPaths.length,
    deleted_file_count,
    failed,
    failure_summary: {
      failed_count: failedCount,
      partial_failure: failedCount > 0 && deleted_file_count > 0,
      delete_failed_count: failedCount,
    },
    backup: { backup_dir: "", copied_count: 0 },
    targets,
  };
}

export async function analyzeDeleteTs(
  threadIds: string[],
  options?: {
    roots?: {
      chatDir?: string;
      stateFilePath?: string;
    };
    sessionScanLimit?: number;
    resolveSessionPath?: (threadId: string) => Promise<string | null>;
    resolveCrossSessionRows?: () => Promise<
      Array<{ session_id: string; display_title?: string; file_path: string }>
    >;
  },
) {
  return analyzeDeleteImpactTs(threadIds, {
    chatDir: options?.roots?.chatDir,
    stateFilePath: options?.roots?.stateFilePath,
    sessionScanLimit: options?.sessionScanLimit,
    resolveSessionPath: options?.resolveSessionPath,
    resolveCrossSessionRows: options?.resolveCrossSessionRows,
  });
}
