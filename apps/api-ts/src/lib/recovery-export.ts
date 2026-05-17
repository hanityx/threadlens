import { createReadStream } from "node:fs";
import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { BACKUP_ROOT, RECOVERY_EXPORT_ROOT } from "./constants.js";
import { scanBackupSets } from "./recovery-backups.js";
import { writePortableZipArchive } from "./recovery-portable-zip.js";
import { nowIsoUtc } from "./utils.js";

type RecoveryRootsOverride = {
  backup_root?: string;
  export_root?: string;
};

type RecoveryBackupExportOptions = {
  backup_ids?: string[];
  roots?: RecoveryRootsOverride;
  archiveWriter?: (sourceDir: string, archivePath: string) => Promise<void> | void;
};

function recoveryExportRoot(override?: string): string {
  return override ?? RECOVERY_EXPORT_ROOT;
}

function hasHiddenPathSegment(filePath: string): boolean {
  return path.resolve(filePath).split(path.sep).some((segment) => segment.startsWith("."));
}

export function resolveRecoveryBackupArchivePath(
  archivePath: string,
  overrideExportRoot?: string,
): string | null {
  const requested = String(archivePath || "").trim();
  if (!requested) return null;
  const exportRoot = path.resolve(recoveryExportRoot(overrideExportRoot));
  const resolved = path.resolve(requested);
  const relative = path.relative(exportRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  if (!resolved.endsWith(".zip")) return null;
  return resolved;
}

function sanitizeBackupExportSegment(backupId: string): string {
  return String(backupId || "")
    .replace(/[\\/]+/g, "__")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "backup-set";
}

async function defaultRecoveryArchiveWriter(sourceDir: string, archivePath: string) {
  await writePortableZipArchive(sourceDir, archivePath);
}

export async function openRecoveryBackupArchiveReadStream(
  archivePath: string,
  overrideExportRoot?: string,
) {
  const resolved = resolveRecoveryBackupArchivePath(archivePath, overrideExportRoot);
  if (!resolved) return null;
  try {
    const archiveStat = await stat(resolved);
    if (!archiveStat.isFile()) return null;
  } catch {
    return null;
  }
  return { archivePath: resolved, stream: createReadStream(resolved) };
}

export async function exportRecoveryBackupsTs(
  options: RecoveryBackupExportOptions = {},
) {
  const requestedIds = Array.from(
    new Set(
      (options.backup_ids ?? [])
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );
  const backupRoot = options.roots?.backup_root ?? BACKUP_ROOT;
  const exportRoot = recoveryExportRoot(options.roots?.export_root);
  if (hasHiddenPathSegment(backupRoot)) {
    return {
      ok: false,
      error: "backup_root_hidden",
      selected_backup_ids: requestedIds,
      missing_backup_ids: [],
      backup_root: backupRoot,
      export_root: exportRoot,
    };
  }
  if (hasHiddenPathSegment(exportRoot)) {
    return {
      ok: false,
      error: "export_root_hidden",
      selected_backup_ids: requestedIds,
      missing_backup_ids: [],
      backup_root: backupRoot,
      export_root: exportRoot,
    };
  }
  const allSets = await scanBackupSets(200, { backupRoot });
  const selectedSets = requestedIds.length
    ? allSets.filter((set) => requestedIds.includes(set.backup_id))
    : allSets;
  const missingBackupIds = requestedIds.filter(
    (backupId) => !selectedSets.some((set) => set.backup_id === backupId),
  );

  if (!selectedSets.length) {
    return {
      ok: false,
      error: requestedIds.length ? "backup-ids-not-found" : "no-backups-found",
      selected_backup_ids: requestedIds,
      missing_backup_ids: missingBackupIds,
      backup_root: backupRoot,
      export_root: exportRoot,
    };
  }

  const timestamp = nowIsoUtc().replace(/[:.]/g, "-");
  const exportDir = path.join(exportRoot, `backup-export-${timestamp}`);
  const payloadRoot = path.join(exportDir, "backup-sets");
  await mkdir(payloadRoot, { recursive: true });

  const exportedSets: Array<{
    backup_id: string;
    source_path: string;
    export_path: string;
    file_count: number;
    total_bytes: number;
    latest_mtime: string;
  }> = [];

  for (const set of selectedSets) {
    const exportPath = path.join(
      payloadRoot,
      sanitizeBackupExportSegment(set.backup_id),
    );
    await cp(set.path, exportPath, { recursive: true });
    exportedSets.push({
      backup_id: set.backup_id,
      source_path: set.path,
      export_path: exportPath,
      file_count: set.file_count,
      total_bytes: set.total_bytes,
      latest_mtime: set.latest_mtime,
    });
  }

  const manifestPath = path.join(exportDir, "manifest.json");
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        generated_at: nowIsoUtc(),
        backup_root: backupRoot,
        export_root: exportRoot,
        selected_backup_ids: selectedSets.map((set) => set.backup_id),
        missing_backup_ids: missingBackupIds,
        exported_count: exportedSets.length,
        exported_sets: exportedSets,
      },
      null,
      2,
    ),
    "utf-8",
  );

  const archivePath = `${exportDir}.zip`;
  const archiveWriter = options.archiveWriter ?? defaultRecoveryArchiveWriter;
  await archiveWriter(exportDir, archivePath);

  return {
    ok: true,
    generated_at: nowIsoUtc(),
    backup_root: backupRoot,
    export_root: exportRoot,
    export_dir: exportDir,
    archive_path: archivePath,
    manifest_path: manifestPath,
    selected_backup_ids: selectedSets.map((set) => set.backup_id),
    missing_backup_ids: missingBackupIds,
    exported_count: exportedSets.length,
    exported_sets: exportedSets,
  };
}
