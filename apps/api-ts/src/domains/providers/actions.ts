import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { BACKUP_ROOT } from "../../lib/constants.js";
import { nowIsoUtc } from "../../lib/utils.js";
import type {
  ProviderId,
  ProviderSessionAction,
  ProviderSessionActionOptions,
} from "./types.js";

type ProviderActionTokenEntry = {
  provider: ProviderId;
  action: ProviderSessionAction;
  paths: string[];
  backup_before_delete: boolean;
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
): { backup_before_delete: boolean } {
  return {
    backup_before_delete: Boolean(options?.backup_before_delete),
  };
}

function requiresProviderCleanupPrivilege(action: ProviderSessionAction): boolean {
  return action !== "backup_local";
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
    entry.backup_before_delete === normalizedOptions.backup_before_delete;
  const samePaths =
    entry.paths.length === normalized.length &&
    entry.paths.every((item, idx) => item === normalized[idx]);
  if (!sameProvider || !sameAction || !sameOptions || !samePaths) {
    return { ok: false, reason: "confirm-token-scope-mismatch" };
  }
  providerActionTokenCache.delete(key);
  return { ok: true, reason: "" };
}

async function stageProviderActionBackup(
  provider: ProviderId,
  action: ProviderSessionAction,
  filePaths: string[],
): Promise<ProviderBackupStageResult> {
  const folderName = `${nowIsoUtc().replace(/[:.]/g, "-")}-${action}`;
  const destination = path.join(
    BACKUP_ROOT,
    "provider_actions",
    provider,
    folderName,
  );
  await mkdir(destination, { recursive: true });

  const items: ProviderBackupManifestItem[] = [];
  const failed: ProviderBackupFailure[] = [];

  for (const rawSourcePath of filePaths) {
    const sourcePath = path.resolve(rawSourcePath);
    const relFromFsRoot = sourcePath.replace(/^([A-Za-z]:)?[\\/]+/, "");
    const targetPath = path.join(destination, relFromFsRoot);
    try {
      await mkdir(path.dirname(targetPath), { recursive: true });
      await copyFile(sourcePath, targetPath);
      items.push({
        source_path: sourcePath,
        backup_rel_path: relFromFsRoot,
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
  const shouldBackup =
    action === "backup_local" ||
    action === "archive_local" ||
    normalizedOptions.backup_before_delete;
  const backupStage = shouldBackup
    ? await stageProviderActionBackup(provider, action, valid)
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
    const deleteTargets = backupStage?.items.map((item) => item.source_path) ?? [];
    for (const sourcePath of deleteTargets) {
      try {
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
    archivedTo = backupTo;
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
