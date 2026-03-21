import { createHash } from "node:crypto";
import { copyFile, mkdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { BACKUP_ROOT, CHAT_DIR, CODEX_HOME } from "../../lib/constants.js";
import { nowIsoUtc } from "../../lib/utils.js";
import { analyzeDeleteImpactTs } from "./impact.js";
import { findThreadArtifactsTs } from "./forensics.js";
import { cleanGlobalStateRefsTs } from "./state.js";

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

type CleanupExecOptions = {
  dryRun?: boolean;
  confirmToken?: string;
  options?: CleanupOptions;
  roots?: {
    chatDir?: string;
    codexHome?: string;
    backupRoot?: string;
    stateFilePath?: string;
  };
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
  const ids = Array.from(
    new Set(threadIds.map((item) => String(item || "").trim()).filter(Boolean)),
  );
  const options = normalizeCleanupOptions(execOptions?.options);
  const roots = {
    chatDir: execOptions?.roots?.chatDir ?? CHAT_DIR,
    codexHome: execOptions?.roots?.codexHome ?? CODEX_HOME,
    backupRoot: execOptions?.roots?.backupRoot ?? BACKUP_ROOT,
    stateFilePath: execOptions?.roots?.stateFilePath,
  };
  const dryRun = execOptions?.dryRun !== false;
  const confirmToken = String(execOptions?.confirmToken ?? "").trim();

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
      mode: "execute",
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
  const backupInfo = await backupPathsTs(backupTargets, roots.backupRoot);

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

  return {
    ok: true,
    mode: "execute",
    requested_ids: ids.length,
    target_file_count: targetPaths.length,
    deleted_file_count,
    failed,
    state_result: executedStateResult,
    backup: {
      backup_dir: backupInfo.backup_dir,
      copied_count: backupInfo.copied_count,
    },
    targets,
    confirm_token_expected,
  };
}

export async function analyzeDeleteTs(
  threadIds: string[],
  options?: {
    roots?: {
      chatDir?: string;
      stateFilePath?: string;
    };
    resolveSessionPath?: (threadId: string) => Promise<string | null>;
  },
) {
  return analyzeDeleteImpactTs(threadIds, {
    chatDir: options?.roots?.chatDir,
    stateFilePath: options?.roots?.stateFilePath,
    resolveSessionPath: options?.resolveSessionPath,
  });
}
