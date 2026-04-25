import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, realpath, stat, unlink, writeFile } from "node:fs/promises";
import { BACKUP_ROOT, HOME_DIR } from "../../lib/constants.js";
import { nowIsoUtc } from "../../lib/utils.js";
import { isPathInsideRoot, providerRootSpecs } from "./path-safety.js";
import type {
  ProviderId,
  ProviderRootSpec,
  ProviderSessionAction,
  ProviderSessionActionOptions,
} from "./types.js";

type ProviderActionTokenEntry = {
  provider: ProviderId;
  action: ProviderSessionAction;
  paths: string[];
  backup_before_delete: boolean;
  backup_root: string;
  expires_at: number;
};

type ProviderBackupManifestItem = {
  source_path: string;
  backup_rel_path: string;
  backup_abs_path: string;
};

type ProviderBackupFailure = {
  file_path: string;
  step: string;
  error: string;
};

type ProviderBackupStageResult = {
  destination: string;
  manifest_path: string;
  items: ProviderBackupManifestItem[];
  failed: ProviderBackupFailure[];
};

type ProviderActionDeps = {
  resolveAllowedProviderFilePath: (
    provider: ProviderId,
    filePath: string,
  ) => Promise<string | null>;
  supportsProviderCleanup: (provider: ProviderId) => boolean;
  invalidateProviderCaches: (provider: ProviderId) => void;
};

const PROVIDER_ACTION_TOKEN_TTL_MS = 10 * 60_000;
const providerActionTokenCache = new Map<string, ProviderActionTokenEntry>();

function normalizeProviderActionPaths(filePaths: string[]): string[] {
  return Array.from(
    new Set(
      filePaths
        .map((item) => path.resolve(String(item || "").trim()))
        .filter(Boolean),
    ),
  ).sort();
}

function normalizeProviderActionOptions(
  options?: ProviderSessionActionOptions,
): { backup_before_delete: boolean; backup_root: string } {
  return {
    backup_before_delete: Boolean(options?.backup_before_delete),
    backup_root: String(options?.backup_root ?? "").trim(),
  };
}

function resolveProviderActionBackupRoot(
  backupRootOverride: string,
): { ok: true; backupRoot: string } | { ok: false; error: string } {
  const backupRoot = backupRootOverride
    ? path.resolve(backupRootOverride)
    : BACKUP_ROOT;
  if (!isPathInsideRoot(backupRoot, HOME_DIR)) {
    return { ok: false, error: "backup_root_outside_home" };
  }
  if (path.relative(HOME_DIR, backupRoot).split(path.sep).some((segment) => segment.startsWith("."))) {
    return { ok: false, error: "backup_root_hidden" };
  }
  return { ok: true, backupRoot };
}

function deriveProviderBackupId(backupRoot: string, backupTo: string | null): string | null {
  if (!backupTo) return null;
  const relativePath = path.relative(path.resolve(backupRoot), path.resolve(backupTo));
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) return null;
  return relativePath.split(path.sep).join("/");
}

function requiresProviderCleanupPrivilege(action: ProviderSessionAction): boolean {
  return action !== "backup_local";
}

function isSafeProviderRelativePath(relativePath: string): boolean {
  return Boolean(relativePath) &&
    relativePath !== "." &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath);
}

async function relativePathWithinProviderRoot(
  filePath: string,
  spec: ProviderRootSpec,
): Promise<string | null> {
  const resolvedPath = path.resolve(filePath);
  if (isPathInsideRoot(resolvedPath, spec.root)) {
    const relativePath = path.relative(spec.root, resolvedPath);
    return isSafeProviderRelativePath(relativePath) ? relativePath : null;
  }

  try {
    const [realTarget, realRoot] = await Promise.all([
      realpath(resolvedPath),
      realpath(spec.root),
    ]);
    if (isPathInsideRoot(realTarget, realRoot)) {
      const relativePath = path.relative(realRoot, realTarget);
      return isSafeProviderRelativePath(relativePath) ? relativePath : null;
    }
  } catch {
    // Fall back to the resolved path comparison above when a root cannot be realpathed.
  }

  return null;
}

async function resolveArchivedSessionRestoreTarget(
  provider: ProviderId,
  filePath: string,
): Promise<string | null> {
  const specs = providerRootSpecs(provider);
  const archivedSpecs = specs
    .filter((spec) => spec.source === "archived_sessions")
    .sort((left, right) => right.root.length - left.root.length);
  const sessionsSpec = specs.find((spec) => spec.source === "sessions");
  let relativePath: string | null = null;
  for (const spec of archivedSpecs) {
    relativePath = await relativePathWithinProviderRoot(filePath, spec);
    if (relativePath) break;
  }
  if (!relativePath) return null;

  if (sessionsSpec && !relativePath.includes(path.sep)) {
    return path.join(sessionsSpec.root, relativePath);
  }
  const [sourceName = "", ...sourceRelativeParts] = relativePath.split(path.sep);
  const sourceRelativePath = sourceRelativeParts.join(path.sep);
  const sourceSpec = specs.find(
    (spec) =>
      spec.source === sourceName &&
      spec.source !== "cleanup_backups" &&
      spec.source !== "archived_sessions",
  );
  if (sourceSpec && sourceRelativePath) {
    return path.join(sourceSpec.root, sourceRelativePath);
  }
  if (sessionsSpec) {
    return path.join(sessionsSpec.root, relativePath);
  }
  return null;
}

async function resolveArchivedSessionStoreTarget(
  provider: ProviderId,
  filePath: string,
): Promise<string | null> {
  const resolvedPath = path.resolve(filePath);
  const specs = providerRootSpecs(provider);
  const archivedSpec = specs.find((spec) => spec.source === "archived_sessions");
  if (!archivedSpec) return null;
  const sourceSpecs = specs
    .filter(
      (spec) =>
        spec.source !== "cleanup_backups" &&
        spec.source !== "archived_sessions" &&
        spec.exts.includes(path.extname(resolvedPath).toLowerCase()),
    )
    .sort((left, right) => right.root.length - left.root.length);
  let sourceSpec: ProviderRootSpec | null = null;
  let relativePath: string | null = null;
  for (const spec of sourceSpecs) {
    relativePath = await relativePathWithinProviderRoot(resolvedPath, spec);
    if (relativePath) {
      sourceSpec = spec;
      break;
    }
  }
  if (!sourceSpec || !relativePath) return null;

  const archiveRelativePath =
    provider === "codex" && sourceSpec.source === "sessions"
      ? relativePath
      : path.join(sourceSpec.source, relativePath);
  return path.join(archivedSpec.root, archiveRelativePath);
}

function resolveArchivedSessionRoot(provider: ProviderId): string | null {
  return providerRootSpecs(provider).find((spec) => spec.source === "archived_sessions")
    ?.root ?? null;
}

function pruneProviderActionTokens(now = Date.now()) {
  for (const [token, entry] of providerActionTokenCache.entries()) {
    if (entry.expires_at <= now) providerActionTokenCache.delete(token);
  }
}

function issueProviderActionConfirmToken(
  provider: ProviderId,
  action: ProviderSessionAction,
  filePaths: string[],
  options?: ProviderSessionActionOptions,
): string {
  const normalized = normalizeProviderActionPaths(filePaths);
  const normalizedOptions = normalizeProviderActionOptions(options);
  const token = `PROVIDER-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  providerActionTokenCache.set(token, {
    provider,
    action,
    paths: normalized,
    backup_before_delete: normalizedOptions.backup_before_delete,
    backup_root: normalizedOptions.backup_root,
    expires_at: Date.now() + PROVIDER_ACTION_TOKEN_TTL_MS,
  });
  return token;
}

function consumeProviderActionConfirmToken(
  token: string,
  provider: ProviderId,
  action: ProviderSessionAction,
  filePaths: string[],
  options?: ProviderSessionActionOptions,
): { ok: boolean; reason: string } {
  pruneProviderActionTokens();
  const normalizedOptions = normalizeProviderActionOptions(options);
  const key = String(token || "").trim();
  if (!key) return { ok: false, reason: "missing-confirm-token" };
  const entry = providerActionTokenCache.get(key);
  if (!entry) return { ok: false, reason: "invalid-confirm-token" };
  if (entry.expires_at <= Date.now()) {
    providerActionTokenCache.delete(key);
    return { ok: false, reason: "expired-confirm-token" };
  }
  const normalized = normalizeProviderActionPaths(filePaths);
  const sameProvider = entry.provider === provider;
  const sameAction = entry.action === action;
  const sameOptions =
    entry.backup_before_delete === normalizedOptions.backup_before_delete &&
    entry.backup_root === normalizedOptions.backup_root;
  const samePaths =
    entry.paths.length === normalized.length &&
    entry.paths.every((item, idx) => item === normalized[idx]);
  if (!sameProvider || !sameAction || !sameOptions || !samePaths) {
    return { ok: false, reason: "confirm-token-scope-mismatch" };
  }
  providerActionTokenCache.delete(key);
  return { ok: true, reason: "" };
}

export function deriveProviderBackupRelativePath(
  provider: ProviderId,
  filePath: string,
): string {
  const resolvedPath = path.resolve(filePath);
  const ext = path.extname(resolvedPath).toLowerCase();
  const matchingSpecs = providerRootSpecs(provider)
    .filter((spec) => spec.exts.includes(ext) && isPathInsideRoot(resolvedPath, spec.root))
    .sort((left, right) => right.root.length - left.root.length);

  for (const spec of matchingSpecs) {
    const relativePath = path.relative(spec.root, resolvedPath);
    if (
      !relativePath ||
      relativePath === "." ||
      relativePath === ".." ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    ) {
      continue;
    }
    return path.join(spec.source, relativePath);
  }

  return path.join("misc", path.basename(resolvedPath));
}

async function stageProviderActionBackup(
  provider: ProviderId,
  action: ProviderSessionAction,
  filePaths: string[],
  backupRoot = BACKUP_ROOT,
): Promise<ProviderBackupStageResult> {
  const folderName = `${nowIsoUtc().replace(/[:.]/g, "-")}-${action}`;
  const destination = path.join(
    backupRoot,
    "provider_actions",
    provider,
    folderName,
  );
  await mkdir(destination, { recursive: true });

  const items: ProviderBackupManifestItem[] = [];
  const failed: ProviderBackupFailure[] = [];

  for (const rawSourcePath of filePaths) {
    const sourcePath = path.resolve(rawSourcePath);
    const backupRelativePath = deriveProviderBackupRelativePath(provider, sourcePath);
    const targetPath = path.join(destination, backupRelativePath);
    try {
      await mkdir(path.dirname(targetPath), { recursive: true });
      await copyFile(sourcePath, targetPath);
      items.push({
        source_path: sourcePath,
        backup_rel_path: backupRelativePath,
        backup_abs_path: targetPath,
      });
    } catch (error) {
      failed.push({
        file_path: sourcePath,
        step: `${action}:backup_copy`,
        error: String(error),
      });
    }
  }

  const manifestPath = path.join(destination, "_manifest.json");
  try {
    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          generated_at: nowIsoUtc(),
          provider,
          action,
          item_count: items.length,
          items,
        },
        null,
        2,
      ),
      "utf-8",
    );
  } catch (error) {
    failed.push({
      file_path: manifestPath,
      step: "manifest_write",
      error: String(error),
    });
  }

  return {
    destination,
    manifest_path: manifestPath,
    items,
    failed,
  };
}

export function buildProviderActionToken(
  provider: ProviderId,
  action: ProviderSessionAction,
  filePaths: string[],
  options?: ProviderSessionActionOptions,
): string {
  const digest = buildProviderActionFingerprint(provider, action, filePaths, options);
  return `PROVIDER-${digest}`;
}

export function buildProviderActionFingerprint(
  provider: ProviderId,
  action: ProviderSessionAction,
  filePaths: string[],
  options?: ProviderSessionActionOptions,
): string {
  const normalizedOptions = normalizeProviderActionOptions(options);
  const normalized = normalizeProviderActionPaths(filePaths);
  const raw = JSON.stringify({
    provider,
    action,
    paths: normalized,
    backup_before_delete: normalizedOptions.backup_before_delete,
    backup_root: normalizedOptions.backup_root,
  });
  const digest = createHash("sha256")
    .update(raw, "utf-8")
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();
  return digest;
}

export async function runProviderSessionAction(
  deps: ProviderActionDeps,
  provider: ProviderId,
  action: ProviderSessionAction,
  filePaths: string[],
  dryRun: boolean,
  confirmToken: string,
  options?: ProviderSessionActionOptions,
) {
  pruneProviderActionTokens();
  const normalizedOptions = normalizeProviderActionOptions(options);
  const uniquePaths = Array.from(
    new Set(filePaths.map((item) => String(item || "").trim()).filter(Boolean)),
  );
  if (
    requiresProviderCleanupPrivilege(action) &&
    !deps.supportsProviderCleanup(provider)
  ) {
    return {
      ok: false,
      provider,
      action,
      dry_run: dryRun,
      target_count: uniquePaths.length,
      valid_count: 0,
      applied_count: 0,
      confirm_token_expected: "",
      confirm_token_accepted: false,
      selection_fingerprint: "",
      backup_before_delete: normalizedOptions.backup_before_delete,
      failure_summary: {
        skipped_count: 0,
        failed_count: 0,
        partial_failure: false,
      },
      skipped: [],
      error: "cleanup-disabled-provider",
    };
  }
  const skipped: Array<{ file_path: string; reason: string }> = [];
  const valid: string[] = [];

  for (const candidate of uniquePaths) {
    const safePath = await deps.resolveAllowedProviderFilePath(provider, candidate);
    if (!safePath) {
      skipped.push({
        file_path: candidate,
        reason: "outside-provider-root-extension-or-realpath",
      });
      continue;
    }
    try {
      const st = await stat(safePath);
      if (!st.isFile()) {
        skipped.push({ file_path: candidate, reason: "not-a-file" });
        continue;
      }
      valid.push(safePath);
    } catch {
      skipped.push({ file_path: candidate, reason: "not-found" });
    }
  }

  if (!valid.length && !dryRun) {
    return {
      ok: false,
      provider,
      action,
      dry_run: false,
      target_count: uniquePaths.length,
      valid_count: valid.length,
      applied_count: 0,
      confirm_token_expected: "",
      confirm_token_accepted: false,
      selection_fingerprint: "",
      backup_before_delete: normalizedOptions.backup_before_delete,
      failure_summary: {
        skipped_count: skipped.length,
        failed_count: 0,
        partial_failure: false,
      },
      skipped,
      error: "no-valid-targets",
    };
  }

  const selectionFingerprint = valid.length
    ? buildProviderActionFingerprint(provider, action, valid, normalizedOptions)
    : "";
  const shouldBackup =
    action === "backup_local" ||
    normalizedOptions.backup_before_delete;
  const backupRootResult = resolveProviderActionBackupRoot(
    normalizedOptions.backup_root,
  );
  if (shouldBackup && !backupRootResult.ok) {
    return {
      ok: false,
      provider,
      action,
      dry_run: dryRun,
      target_count: uniquePaths.length,
      valid_count: valid.length,
      applied_count: 0,
      confirm_token_expected: "",
      confirm_token_accepted: false,
      selection_fingerprint: selectionFingerprint,
      backup_before_delete: normalizedOptions.backup_before_delete,
      failure_summary: {
        skipped_count: skipped.length,
        failed_count: 0,
        partial_failure: false,
      },
      skipped,
      error: backupRootResult.error,
    };
  }

  if (dryRun) {
    const expectedToken = valid.length
      ? issueProviderActionConfirmToken(provider, action, valid, normalizedOptions)
      : "";
    return {
      ok: true,
      provider,
      action,
      dry_run: true,
      target_count: uniquePaths.length,
      valid_count: valid.length,
      applied_count: 0,
      confirm_token_expected: expectedToken,
      confirm_token_accepted: false,
      selection_fingerprint: selectionFingerprint,
      backup_before_delete: normalizedOptions.backup_before_delete,
      failure_summary: {
        skipped_count: skipped.length,
        failed_count: 0,
        partial_failure: false,
      },
      skipped,
      mode: "preview",
    };
  }

  if (action !== "backup_local") {
    const consume = consumeProviderActionConfirmToken(
      confirmToken,
      provider,
      action,
      valid,
      normalizedOptions,
    );
    if (!consume.ok) {
      const expectedToken = valid.length
        ? issueProviderActionConfirmToken(provider, action, valid, normalizedOptions)
        : "";
      return {
        ok: false,
        provider,
        action,
        dry_run: false,
        target_count: uniquePaths.length,
        valid_count: valid.length,
      applied_count: 0,
      confirm_token_expected: expectedToken,
      confirm_token_accepted: false,
      selection_fingerprint: selectionFingerprint,
      backup_before_delete: normalizedOptions.backup_before_delete,
      failure_summary: {
        skipped_count: skipped.length,
        failed_count: 0,
        partial_failure: false,
      },
      skipped,
      error: consume.reason,
    };
  }
  }

  let applied = 0;
  let archivedTo: string | null = null;
  let backupTo: string | null = null;
  let backupManifestPath: string | null = null;
  let backedUpCount = 0;
  const failed: Array<{ file_path: string; step: string; error: string }> = [];
  const backupRoot = backupRootResult.ok ? backupRootResult.backupRoot : BACKUP_ROOT;
  const backupStage = shouldBackup
    ? await stageProviderActionBackup(provider, action, valid, backupRoot)
    : null;
  if (backupStage) {
    failed.push(...backupStage.failed);
    backupTo = backupStage.destination;
    backupManifestPath = backupStage.manifest_path;
    backedUpCount = backupStage.items.length;
  }

  if (action === "backup_local") {
    applied = backupStage?.items.length ?? 0;
  } else if (action === "archive_local") {
    archivedTo = resolveArchivedSessionRoot(provider);
    for (const sourcePath of valid) {
      const targetPath = await resolveArchivedSessionStoreTarget(provider, sourcePath);
      if (!targetPath) {
        failed.push({
          file_path: sourcePath,
          step: "archive_local",
          error: "no-archived-session-target",
        });
        continue;
      }
      try {
        await stat(targetPath);
        failed.push({
          file_path: sourcePath,
          step: "archive_local",
          error: "target-already-exists",
        });
        continue;
      } catch {
        // Missing target is expected before archive.
      }
      try {
        await mkdir(path.dirname(targetPath), { recursive: true });
        await copyFile(sourcePath, targetPath);
        await unlink(sourcePath);
        applied += 1;
      } catch (error) {
        failed.push({
          file_path: sourcePath,
          step: "archive_local",
          error: String(error),
        });
      }
    }
  } else if (action === "unarchive_local") {
    for (const sourcePath of valid) {
      const targetPath = await resolveArchivedSessionRestoreTarget(provider, sourcePath);
      if (!targetPath) {
        failed.push({
          file_path: sourcePath,
          step: "unarchive_local",
          error: "not-an-archived-session",
        });
        continue;
      }
      try {
        await stat(targetPath);
        failed.push({
          file_path: sourcePath,
          step: "unarchive_local",
          error: "target-already-exists",
        });
        continue;
      } catch {
        // Missing target is expected before restore.
      }
      try {
        await mkdir(path.dirname(targetPath), { recursive: true });
        await copyFile(sourcePath, targetPath);
        await unlink(sourcePath);
        applied += 1;
      } catch (error) {
        failed.push({
          file_path: sourcePath,
          step: "unarchive_local",
          error: String(error),
        });
      }
    }
  } else {
    const deleteTargets = backupStage?.items.map((item) => item.source_path) ?? valid;
    for (const sourcePath of deleteTargets) {
      try {
        await unlink(sourcePath);
        applied += 1;
      } catch (error) {
        failed.push({
          file_path: sourcePath,
          step: "delete_local",
          error: String(error),
        });
      }
    }
  }

  deps.invalidateProviderCaches(provider);

  return {
    ok: failed.length === 0,
    provider,
    action,
    dry_run: false,
    target_count: uniquePaths.length,
    valid_count: valid.length,
    applied_count: applied,
    confirm_token_expected: "",
    confirm_token_accepted: action === "backup_local" ? false : true,
    selection_fingerprint: selectionFingerprint,
    backup_before_delete: normalizedOptions.backup_before_delete,
    backed_up_count: backedUpCount,
    backup_id: deriveProviderBackupId(backupRoot, backupTo),
    backup_to: backupTo,
    backup_manifest_path: backupManifestPath,
    backup_summary: shouldBackup
      ? {
          destination: backupTo,
          manifest_path: backupManifestPath,
          copied_count: backedUpCount,
          failed_count: backupStage?.failed.length ?? 0,
        }
      : null,
    failure_summary: {
      skipped_count: skipped.length,
      failed_count: failed.length,
      partial_failure: failed.length > 0 && applied > 0,
    },
    skipped,
    failed,
    archived_to: archivedTo,
    mode: failed.length === 0 ? "applied" : applied > 0 ? "partial" : "failed",
  };
}
