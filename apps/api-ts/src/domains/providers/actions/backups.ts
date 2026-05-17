import path from "node:path";
import { copyFile, mkdir, realpath, writeFile } from "node:fs/promises";
import { BACKUP_ROOT, HOME_DIR } from "../../../lib/constants.js";
import { nowIsoUtc } from "../../../lib/utils.js";
import {
  isPathInsideRoot,
  providerRootSpecs,
  providerScanRootSpecs,
} from "../path-safety.js";
import type {
  ProviderId,
  ProviderSessionAction,
} from "../types.js";

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

export type ProviderBackupStageResult = {
  destination: string;
  manifest_path: string;
  items: ProviderBackupManifestItem[];
  failed: ProviderBackupFailure[];
};

export async function resolveProviderActionBackupRoot(
  backupRootOverride: string,
): Promise<{ ok: true; backupRoot: string } | { ok: false; error: string }> {
  const backupRoot = backupRootOverride
    ? path.resolve(backupRootOverride)
    : BACKUP_ROOT;
  if (!isPathInsideRoot(backupRoot, HOME_DIR)) {
    return { ok: false, error: "backup_root_outside_home" };
  }
  if (path.relative(HOME_DIR, backupRoot).split(path.sep).some((segment) => segment.startsWith("."))) {
    return { ok: false, error: "backup_root_hidden" };
  }
  const realHome = await realpath(HOME_DIR).catch(() => path.resolve(HOME_DIR));
  const realBackupAncestor = await resolveExistingAncestorRealpath(backupRoot);
  if (realBackupAncestor && !isPathInsideRoot(realBackupAncestor, realHome)) {
    return { ok: false, error: "backup_root_outside_home" };
  }
  return { ok: true, backupRoot };
}

async function resolveExistingAncestorRealpath(filePath: string): Promise<string | null> {
  let currentPath = path.resolve(filePath);
  while (true) {
    try {
      return await realpath(currentPath);
    } catch {
      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) return null;
      currentPath = parentPath;
    }
  }
}

export function deriveProviderBackupId(
  backupRoot: string,
  backupTo: string | null,
): string | null {
  if (!backupTo) return null;
  const relativePath = path.relative(path.resolve(backupRoot), path.resolve(backupTo));
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) return null;
  return relativePath.split(path.sep).join("/");
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
    if (!isSafeProviderBackupRelativePath(relativePath)) continue;
    return path.join(spec.source, relativePath);
  }

  return path.join("misc", path.basename(resolvedPath));
}

async function deriveProviderBackupRelativePathForSafePath(
  provider: ProviderId,
  filePath: string,
): Promise<string> {
  const resolvedPath = path.resolve(filePath);
  let realSourcePath = resolvedPath;
  try {
    realSourcePath = await realpath(resolvedPath);
  } catch {
    return deriveProviderBackupRelativePath(provider, resolvedPath);
  }

  const ext = path.extname(realSourcePath).toLowerCase();
  const matchingSpecs: Array<{ source: string; root: string }> = [];
  for (const spec of await providerScanRootSpecs(provider)) {
    if (!spec.exts.includes(ext)) continue;
    try {
      const realRoot = await realpath(spec.root);
      if (
        realSourcePath === realRoot ||
        realSourcePath.startsWith(`${realRoot}${path.sep}`)
      ) {
        matchingSpecs.push({ source: spec.source, root: realRoot });
      }
    } catch {
      continue;
    }
  }

  matchingSpecs.sort((left, right) => right.root.length - left.root.length);
  for (const spec of matchingSpecs) {
    const relativePath = path.relative(spec.root, realSourcePath);
    if (!isSafeProviderBackupRelativePath(relativePath)) continue;
    return path.join(spec.source, relativePath);
  }

  return deriveProviderBackupRelativePath(provider, realSourcePath);
}

export async function stageProviderActionBackup(
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
  const manifestPath = path.join(destination, "_manifest.json");
  const destinationSafety = await validateProviderBackupDestination(destination);
  if (!destinationSafety.ok) {
    return {
      destination,
      manifest_path: manifestPath,
      items: [],
      failed: [
        {
          file_path: destination,
          step: "backup_root",
          error: destinationSafety.error,
        },
      ],
    };
  }
  await mkdir(destination, { recursive: true });
  const realDestination = await realpath(destination).catch(() => null);
  if (!realDestination || !isPathInsideRoot(realDestination, destinationSafety.realHome)) {
    return {
      destination,
      manifest_path: manifestPath,
      items: [],
      failed: [
        {
          file_path: destination,
          step: "backup_root",
          error: "backup_root_outside_home",
        },
      ],
    };
  }

  const items: ProviderBackupManifestItem[] = [];
  const failed: ProviderBackupFailure[] = [];

  for (const rawSourcePath of filePaths) {
    const sourcePath = path.resolve(rawSourcePath);
    const backupRelativePath = await deriveProviderBackupRelativePathForSafePath(provider, sourcePath);
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

async function validateProviderBackupDestination(
  destination: string,
): Promise<{ ok: true; realHome: string } | { ok: false; error: string }> {
  const realHome = await realpath(HOME_DIR).catch(() => path.resolve(HOME_DIR));
  const realDestinationAncestor = await resolveExistingAncestorRealpath(destination);
  if (realDestinationAncestor && !isPathInsideRoot(realDestinationAncestor, realHome)) {
    return { ok: false, error: "backup_root_outside_home" };
  }
  return { ok: true, realHome };
}

function isSafeProviderBackupRelativePath(relativePath: string): boolean {
  return Boolean(relativePath) &&
    relativePath !== "." &&
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath);
}
