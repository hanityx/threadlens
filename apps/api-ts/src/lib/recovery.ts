/**
 * Recovery center, runtime health, data-source inventory,
 * related-tools status, and roadmap operations.
 */

import { createReadStream } from "node:fs";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
  chmod,
} from "node:fs/promises";
import path from "node:path";
import {
  PROJECT_ROOT,
  START_TS,
  CODEX_HOME,
  BACKUP_ROOT,
  RECOVERY_EXPORT_ROOT,
  RECOVERY_CHECKLIST_FILE,
  RECOVERY_PLAN_DIR,
  CHAT_DIR,
} from "./constants.js";
import {
  pathExists,
  readJsonFile,
  walkFiles,
  isRecord,
  nowIsoUtc,
  parseNumber,
  runCmdText,
  safeJsonParse,
  countDirsWithPrefix,
  quickFileCount,
  countJsonlFilesRecursive,
} from "./utils.js";

/* ─────────────────────────────────────────────────────────────────── *
 *  Recovery checklist                                                 *
 * ─────────────────────────────────────────────────────────────────── */

type RecoveryChecklistItem = {
  id: string;
  label: string;
  done: boolean;
};

function defaultRecoveryChecklist(): RecoveryChecklistItem[] {
  return [
    { id: "backup_exists", label: "Confirm the latest backup set exists", done: false },
    { id: "dry_run_ok", label: "Review the cleanup dry-run result", done: false },
    { id: "token_verified", label: "Verify the execution token", done: false },
    { id: "drill_run", label: "Run and review the recovery drill", done: false },
    { id: "post_verify", label: "Verify state after execution", done: false },
  ];
}

async function loadRecoveryChecklist(): Promise<RecoveryChecklistItem[]> {
  const data = await readJsonFile(RECOVERY_CHECKLIST_FILE);
  if (isRecord(data) && Array.isArray(data.items)) {
    return data.items
      .filter((item) => isRecord(item))
      .map((item) => ({
        id: String(item.id ?? ""),
        label: String(item.label ?? ""),
        done: Boolean(item.done),
      }))
      .filter((item) => item.id && item.label);
  }
  const defaults = defaultRecoveryChecklist();
  await saveRecoveryChecklist(defaults);
  return defaults;
}

async function saveRecoveryChecklist(items: RecoveryChecklistItem[]) {
  await mkdir(path.dirname(RECOVERY_CHECKLIST_FILE), { recursive: true });
  await writeFile(
    RECOVERY_CHECKLIST_FILE,
    JSON.stringify({ items }, null, 2),
    "utf-8",
  );
}

export async function updateRecoveryChecklistItem(
  itemId: string,
  done: boolean,
) {
  const id = String(itemId ?? "").trim();
  if (!id) return { ok: false, error: "item_id is required" };
  const items = await loadRecoveryChecklist();
  let changed = false;
  const next = items.map((item) => {
    if (item.id !== id) return item;
    changed = true;
    return { ...item, done: Boolean(done) };
  });
  if (!changed) return { ok: false, error: "checklist item not found" };
  await saveRecoveryChecklist(next);
  return { ok: true, items: next };
}

/* ─────────────────────────────────────────────────────────────────── *
 *  Backup scanning & restore plans                                    *
 * ─────────────────────────────────────────────────────────────────── */

type RecoveryItem = {
  src: string;
  dst: string;
  rel: string;
};

type RecoveryBackupSet = {
  backup_id: string;
  path: string;
  file_count: number;
  total_bytes: number;
  latest_mtime: string;
  sample_files: string[];
};

const LEGACY_BACKUP_ROOT = path.join(CODEX_HOME, "local_cleanup_backups");

type RecoveryBackupCandidate = {
  backup_id: string;
  path: string;
  rank: number;
  mtime_ms: number;
};

type RecoveryRootsOverride = {
  backup_root?: string;
  export_root?: string;
};

type RelatedToolConfig = {
  id: string;
  name: string;
  path?: string;
  command?: string;
  location?: string;
  running_pattern?: string;
  tmux_session?: string;
  start_cmd?: string;
  watch_cmd?: string;
  notes?: string;
};

function sanitizeRelatedToolConfig(raw: unknown): RelatedToolConfig | null {
  if (!isRecord(raw)) return null;
  const name = String(raw.name ?? "").trim();
  if (!name) return null;
  const providedId = String(raw.id ?? "").trim();
  const id =
    providedId ||
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  if (!id) return null;
  return {
    id,
    name,
    path: String(raw.path ?? "").trim() || undefined,
    command: String(raw.command ?? "").trim() || undefined,
    location: String(raw.location ?? "").trim() || undefined,
    running_pattern: String(raw.running_pattern ?? "").trim() || undefined,
    tmux_session: String(raw.tmux_session ?? "").trim() || undefined,
    start_cmd: String(raw.start_cmd ?? "").trim() || undefined,
    watch_cmd: String(raw.watch_cmd ?? "").trim() || undefined,
    notes: String(raw.notes ?? "").trim() || undefined,
  };
}

function loadRelatedToolConfigs(): RelatedToolConfig[] {
  const raw = String(process.env.THREADLENS_RELATED_TOOLS_JSON ?? "").trim();
  if (!raw) return [];
  const parsed = safeJsonParse(raw);
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  return parsed
    .map((item) => sanitizeRelatedToolConfig(item))
    .filter((item): item is RelatedToolConfig => Boolean(item))
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
}

function resolveRelatedToolCommand(command?: string): string {
  const normalized = String(command ?? "").trim();
  if (!normalized || !/^[a-zA-Z0-9._-]+$/.test(normalized)) return "";
  return runCmdText(`command -v ${normalized}`);
}

async function resolveRelatedToolStatus(
  config: RelatedToolConfig,
  tmuxLs: string,
) {
  let resolvedLocation = "";
  let installed = false;

  const toolPath = String(config.path ?? "").trim();
  if (toolPath && await pathExists(toolPath)) {
    resolvedLocation = toolPath;
    installed = true;
  }

  if (!installed) {
    const commandLocation = resolveRelatedToolCommand(config.command);
    if (commandLocation) {
      resolvedLocation = commandLocation;
      installed = true;
    }
  }

  const runningPattern = String(config.running_pattern ?? config.command ?? "").trim();
  const running = runningPattern
    ? Boolean(runCmdText(`pgrep -fl '${runningPattern.replace(/'/g, "'\\''")}'`))
    : false;
  const tmuxSession = String(config.tmux_session ?? "").trim();
  const tmuxSessionReady = tmuxSession
    ? tmuxLs
        .split("\n")
        .some((line) => line.trim().startsWith(`${tmuxSession}:`))
    : false;

  return {
    id: config.id,
    name: config.name,
    installed,
    running,
    location: resolvedLocation || config.location || "(not found)",
    start_cmd: config.start_cmd || "",
    watch_cmd: config.watch_cmd || "",
    notes: config.notes || "",
    ...(tmuxSession ? { tmux_session_ready: tmuxSessionReady } : {}),
  };
}

function isCleanupBackupId(name: string): boolean {
  return /^\d{8}T\d{6}Z$/.test(String(name || "").trim());
}

async function listBackupCandidates(
  options?: { backupRoot?: string },
): Promise<RecoveryBackupCandidate[]> {
  const backupRoot = options?.backupRoot ?? BACKUP_ROOT;
  const entries = await readdir(backupRoot, { withFileTypes: true }).catch(
    () => [],
  );
  const out: RecoveryBackupCandidate[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const backupId = entry.name;
    const fullPath = path.join(backupRoot, backupId);
    const dirStat = await stat(fullPath).catch(() => null);
    const dirMtimeMs = Number(dirStat?.mtimeMs ?? 0);

    if (isCleanupBackupId(backupId)) {
      out.push({
        backup_id: backupId,
        path: fullPath,
        rank: 0,
        mtime_ms: dirMtimeMs,
      });
      continue;
    }

    if (backupId !== "provider_actions") {
      out.push({
        backup_id: backupId,
        path: fullPath,
        rank: 2,
        mtime_ms: dirMtimeMs,
      });
      continue;
    }

    // Provider action archives are nested: provider_actions/<provider>/<timestamp>.
    const providers = await readdir(fullPath, { withFileTypes: true }).catch(
      () => [],
    );
    for (const providerEntry of providers) {
      if (!providerEntry.isDirectory()) continue;
      const providerDir = path.join(fullPath, providerEntry.name);
      const runs = await readdir(providerDir, { withFileTypes: true }).catch(
        () => [],
      );
      for (const runEntry of runs) {
        if (!runEntry.isDirectory()) continue;
        const runDir = path.join(providerDir, runEntry.name);
        const runStat = await stat(runDir).catch(() => null);
        out.push({
          backup_id: `provider_actions/${providerEntry.name}/${runEntry.name}`,
          path: runDir,
          rank: 1,
          mtime_ms: Number(runStat?.mtimeMs ?? dirMtimeMs),
        });
      }
    }
  }

  return out;
}

async function scanBackupSets(
  limit = 20,
  options?: { backupRoot?: string },
): Promise<RecoveryBackupSet[]> {
  try {
    const candidates = await listBackupCandidates(options);
    const dirs = candidates
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        if (a.mtime_ms !== b.mtime_ms) return b.mtime_ms - a.mtime_ms;
        return b.backup_id.localeCompare(a.backup_id);
      })
      .slice(0, Math.max(1, limit));

    const result: RecoveryBackupSet[] = [];
    for (const candidate of dirs) {
      const root = candidate.path;
      const files = await walkFiles(root, 20_000);
      let totalBytes = 0;
      let latestMtime = 0;
      for (const file of files) {
        try {
          const st = await stat(file);
          totalBytes += Number(st.size);
          latestMtime = Math.max(latestMtime, Number(st.mtimeMs));
        } catch {
          // no-op
        }
      }
      result.push({
        backup_id: candidate.backup_id,
        path: root,
        file_count: files.length,
        total_bytes: totalBytes,
        latest_mtime: latestMtime ? new Date(latestMtime).toISOString() : "",
        sample_files: files.slice(0, 20),
      });
    }
    return result;
  } catch {
    return [];
  }
}

type RecoveryBackupExportOptions = {
  backup_ids?: string[];
  roots?: RecoveryRootsOverride;
  archiveWriter?: (sourceDir: string, archivePath: string) => Promise<void> | void;
};

const ZIP_UINT16_MAX = 0xffff;
const ZIP_UINT32_MAX = 0xffffffff;
const DEFAULT_PORTABLE_ZIP_MAX_BYTES = 512 * 1024 * 1024;

function portableZipMaxBytes(): number {
  const raw = Number(process.env.THREADLENS_PORTABLE_ZIP_MAX_BYTES ?? "");
  if (Number.isFinite(raw) && raw > 0) {
    return Math.min(Math.floor(raw), ZIP_UINT32_MAX);
  }
  return DEFAULT_PORTABLE_ZIP_MAX_BYTES;
}

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

const CRC32_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

async function collectZipEntries(
  sourceDir: string,
  rootName = path.basename(sourceDir),
): Promise<Array<{ name: string; data: Buffer; mtime: Date; directory: boolean }>> {
  const entries: Array<{ name: string; data: Buffer; mtime: Date; directory: boolean }> = [];
  const maxTotalBytes = portableZipMaxBytes();
  let totalBytes = 0;
  const walk = async (absoluteDir: string, relativeDir: string) => {
    const dirStat = await stat(absoluteDir);
    const directoryName = `${relativeDir.replace(/\\/g, "/").replace(/\/?$/, "/")}`;
    if (Buffer.byteLength(directoryName, "utf8") > ZIP_UINT16_MAX) {
      throw new Error("portable-zip-entry-name-too-long");
    }
    entries.push({
      name: directoryName,
      data: Buffer.alloc(0),
      mtime: dirStat.mtime,
      directory: true,
    });
    const children = await readdir(absoluteDir, { withFileTypes: true });
    for (const child of children) {
      const childPath = path.join(absoluteDir, child.name);
      const childRelative = `${relativeDir}/${child.name}`.replace(/\\/g, "/");
      if (child.isDirectory()) {
        await walk(childPath, childRelative);
      } else if (child.isFile()) {
        const fileStat = await stat(childPath);
        if (fileStat.size > ZIP_UINT32_MAX) {
          throw new Error("portable-zip-entry-too-large");
        }
        totalBytes += fileStat.size;
        if (totalBytes > maxTotalBytes) {
          throw new Error("portable-zip-total-size-limit-exceeded");
        }
        if (Buffer.byteLength(childRelative, "utf8") > ZIP_UINT16_MAX) {
          throw new Error("portable-zip-entry-name-too-long");
        }
        entries.push({
          name: childRelative,
          data: await readFile(childPath),
          mtime: fileStat.mtime,
          directory: false,
        });
      }
    }
  };
  await walk(sourceDir, rootName || "recovery-export");
  if (entries.length > ZIP_UINT16_MAX) {
    throw new Error("portable-zip-entry-count-limit-exceeded");
  }
  return entries;
}

async function writePortableZipArchive(sourceDir: string, archivePath: string) {
  const entries = await collectZipEntries(sourceDir);
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const { time, date } = dosTimestamp(entry.mtime);
    const checksum = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, entry.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(entry.directory ? 0x10 : 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + entry.data.length;
    if (offset > ZIP_UINT32_MAX) {
      throw new Error("portable-zip-archive-too-large");
    }
  }

  const centralDirectory = Buffer.concat(centralParts);
  if (centralDirectory.length > ZIP_UINT32_MAX) {
    throw new Error("portable-zip-central-directory-too-large");
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  await writeFile(archivePath, Buffer.concat([...localParts, centralDirectory, end]));
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

async function buildRestorePlan(
  backupDir: string,
  maxFiles = 400,
): Promise<{
  ok: boolean;
  error?: string;
  plan_path?: string;
  items?: RecoveryItem[];
}> {
  const allowedTopLevel = new Set(["Users", "home"]);
  function shellSingleQuote(text: string): string {
    return `'${String(text).replace(/'/g, `'\\''`)}'`;
  }
  try {
    const files = await walkFiles(backupDir, maxFiles);
    const items: RecoveryItem[] = files
      .map((src) => {
        const rel = path.relative(backupDir, src);
        const seg = rel.split(/[\\/]/).filter(Boolean);
        const base = path.basename(rel);
        if (!seg.length) return null;
        if (base.startsWith("_")) return null;
        if (!allowedTopLevel.has(seg[0])) return null;
        const dst = path.join("/", rel);
        return { src, dst, rel };
      })
      .filter((item): item is RecoveryItem => Boolean(item));

    const ts =
      new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
    await mkdir(RECOVERY_PLAN_DIR, { recursive: true });
    const planPath = path.join(RECOVERY_PLAN_DIR, `restore-plan-${ts}.sh`);

    const lines = [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `# generated_at=${nowIsoUtc()}`,
      `# backup_dir=${backupDir}`,
      "# restore preview only (manual review required)",
      "# no files are copied by this script",
      "echo 'Restore preview (no-op):'",
      "",
    ];
    for (const item of items) {
      const previewLine = `${item.src} -> ${item.dst}`;
      lines.push(
        `printf '%s\\n' ${shellSingleQuote(previewLine)}`,
      );
    }
    await writeFile(planPath, `${lines.join("\n")}\n`, "utf-8");
    await chmod(planPath, 0o700);
    return { ok: true, plan_path: planPath, items };
  } catch (error) {
    return { ok: false, error: String(error), items: [] };
  }
}

/* ─────────────────────────────────────────────────────────────────── *
 *  Recovery center / drill                                            *
 * ─────────────────────────────────────────────────────────────────── */

export async function getRecoveryCenterDataTs(options?: {
  backupRoot?: string;
  legacyBackupRoot?: string;
}) {
  const backupRoot = options?.backupRoot ?? BACKUP_ROOT;
  const legacyBackupRoot = options?.legacyBackupRoot ?? LEGACY_BACKUP_ROOT;
  const backupSets = await scanBackupSets(20, { backupRoot });
  const legacyBackupSets =
    path.resolve(backupRoot) === path.resolve(legacyBackupRoot)
      ? []
      : await scanBackupSets(20, { backupRoot: legacyBackupRoot });
  const checklist = await loadRecoveryChecklist();
  const checklistDone = checklist.filter((item) => item.done).length;
  return {
    generated_at: nowIsoUtc(),
    default_backup_root: BACKUP_ROOT,
    default_export_root: RECOVERY_EXPORT_ROOT,
    backup_root: backupRoot,
    plan_root: RECOVERY_PLAN_DIR,
    backup_sets: backupSets,
    legacy_backup_sets: legacyBackupSets,
    backup_total: backupSets.length,
    checklist,
    checklist_done: checklistDone,
    checklist_total: checklist.length,
  };
}

export async function runRecoveryDrillTs() {
  const backups = await scanBackupSets(20);
  if (!backups.length) {
    return {
      ok: false,
      error: "no backups found",
      backup_total: 0,
      drill: {},
      checklist: await loadRecoveryChecklist(),
    };
  }
  const latest =
    backups.find((item) => isCleanupBackupId(item.backup_id)) ?? backups[0];
  const plan = await buildRestorePlan(latest.path, 400);
  const items = plan.items ?? [];

  let destExistsCount = 0;
  let destMissingParentCount = 0;
  for (const item of items) {
    try {
      await stat(item.dst);
      destExistsCount += 1;
    } catch {
      try {
        await stat(path.dirname(item.dst));
      } catch {
        destMissingParentCount += 1;
      }
    }
  }

  return {
    ok: Boolean(plan.ok),
    backup_total: backups.length,
    latest_backup: latest,
    drill: {
      restore_item_count: items.length,
      dest_exists_count: destExistsCount,
      dest_missing_parent_count: destMissingParentCount,
      plan_path: plan.plan_path ?? "",
      preview_items: items.slice(0, 40),
    },
    checklist: await loadRecoveryChecklist(),
    error: plan.error ?? "",
  };
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

/* ─────────────────────────────────────────────────────────────────── *
 *  Related-tools status                                               *
 * ─────────────────────────────────────────────────────────────────── */

export async function getRelatedToolsStatusTs() {
  const tmuxLs = runCmdText("tmux ls");
  const overviewRunning = Boolean(
    runCmdText("lsof -nP -iTCP:8788 -sTCP:LISTEN"),
  );
  const configuredTools = await Promise.all(
    loadRelatedToolConfigs().map((tool) => resolveRelatedToolStatus(tool, tmuxLs)),
  );

  const apps = [
    ...configuredTools,
    {
      id: "threadlens",
      name: "ThreadLens",
      installed: await pathExists(PROJECT_ROOT),
      running: overviewRunning,
      location: path.join(PROJECT_ROOT, "apps", "api-ts", "src", "app", "create-server.ts"),
      start_cmd: `tmux new-session -d -s threadlens-api \"cd ${PROJECT_ROOT} && pnpm --filter @threadlens/api dev\"`,
      watch_cmd: "tmux attach -t threadlens-api",
      notes: "Local multi-provider observability dashboard (TS-only runtime)",
    },
  ];
  const summary = {
    total: apps.length,
    installed_total: apps.filter((a) => a.installed).length,
    running_total: apps.filter((a) => a.running).length,
  };
  return {
    generated_at: nowIsoUtc(),
    summary,
    apps,
  };
}

export async function getCompareAppsStatusTs() {
  return getRelatedToolsStatusTs();
}

/* ─────────────────────────────────────────────────────────────────── *
 *  Runtime health                                                     *
 * ─────────────────────────────────────────────────────────────────── */

export async function getRuntimeHealthTs() {
  const nowMs = Date.now();
  const uptimeSec = Math.max(0, (nowMs - START_TS) / 1000);
  const hours = Math.floor(uptimeSec / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);
  const seconds = Math.floor(uptimeSec % 60);
  const uptimeHuman = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const roots = {
    codex_root: await pathExists(CODEX_HOME),
    chat_root: await pathExists(CHAT_DIR),
    sessions_root: await pathExists(path.join(CODEX_HOME, "sessions")),
    archived_sessions_root: await pathExists(
      path.join(CODEX_HOME, "archived_sessions"),
    ),
    history_file: await pathExists(path.join(CODEX_HOME, "history.jsonl")),
    global_state_file: await pathExists(
      path.join(CODEX_HOME, ".codex-global-state.json"),
    ),
  };

  const quickCounts = {
    chat_conversation_dirs: await countDirsWithPrefix(
      CHAT_DIR,
      "conversations-v3-",
    ),
    chat_project_dirs: await countDirsWithPrefix(CHAT_DIR, "project-g-p-"),
    sessions_jsonl_files: await countJsonlFilesRecursive(
      path.join(CODEX_HOME, "sessions"),
    ),
    archived_sessions_jsonl_files: await countJsonlFilesRecursive(
      path.join(CODEX_HOME, "archived_sessions"),
    ),
    codex_top_level_files: await quickFileCount(CODEX_HOME),
  };

  return {
    generated_at: nowIsoUtc(),
    uptime_sec: Number(uptimeSec.toFixed(3)),
    uptime_human: uptimeHuman,
    uptime_min: Number((uptimeSec / 60).toFixed(2)),
    cache_warm: false,
    cache_age_sec: null,
    thread_total: null,
    roots,
    quick_counts: quickCounts,
  };
}

/* ─────────────────────────────────────────────────────────────────── *
 *  Smoke status                                                      *
 * ─────────────────────────────────────────────────────────────────── */

const SMOKE_SUMMARY_DIR = path.join(PROJECT_ROOT, ".run", "smoke");
const SMOKE_SUMMARY_FILE_RE = /^smoke-summary-(\d{8}T\d{6}Z)\.json$/;
const PERF_SMOKE_DIR = path.join(PROJECT_ROOT, ".run", "perf");
const PERF_SMOKE_FILE_RE = /^perf-smoke-(\d{8}T\d{6}Z)\.json$/;
const FORENSICS_SMOKE_DIR = path.join(PROJECT_ROOT, ".run", "forensics");
const FORENSICS_SMOKE_FILE_RE = /^forensics-smoke-(\d{8}T\d{6}Z)\.json$/;

type SmokeStatusRootOverrides = Partial<{
  summary_dir_abs: string;
  summary_dir_rel: string;
  perf_dir_abs: string;
  perf_dir_rel: string;
  forensics_dir_abs: string;
  forensics_dir_rel: string;
}>;

type SmokeStatusRoots = {
  summary_dir_abs: string;
  summary_dir_rel: string;
  perf_dir_abs: string;
  perf_dir_rel: string;
  forensics_dir_abs: string;
  forensics_dir_rel: string;
};

function resolveSmokeStatusRoots(
  overrides?: SmokeStatusRootOverrides,
): SmokeStatusRoots {
  const summaryDirRel = String(overrides?.summary_dir_rel ?? ".run/smoke").trim();
  const perfDirRel = String(overrides?.perf_dir_rel ?? ".run/perf").trim();
  const forensicsDirRel = String(overrides?.forensics_dir_rel ?? ".run/forensics").trim();
  return {
    summary_dir_abs: String(overrides?.summary_dir_abs ?? SMOKE_SUMMARY_DIR),
    summary_dir_rel: summaryDirRel || ".run/smoke",
    perf_dir_abs: String(overrides?.perf_dir_abs ?? PERF_SMOKE_DIR),
    perf_dir_rel: perfDirRel || ".run/perf",
    forensics_dir_abs: String(overrides?.forensics_dir_abs ?? FORENSICS_SMOKE_DIR),
    forensics_dir_rel: forensicsDirRel || ".run/forensics",
  };
}

function parseNullableNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseTimestampFromFileName(fileName: string, fileNameRe: RegExp): string {
  const match = fileNameRe.exec(String(fileName || "").trim());
  return match?.[1] ?? "";
}

function parseSmokeTimestampFromName(fileName: string): string {
  return parseTimestampFromFileName(fileName, SMOKE_SUMMARY_FILE_RE);
}

function parseSmokeTimestampUtcMs(timestampUtc: string): number | null {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(
    String(timestampUtc || "").trim(),
  );
  if (!match) return null;
  const [, yyyy, mm, dd, hh, mi, ss] = match;
  const ms = Date.UTC(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(mi),
    Number(ss),
  );
  return Number.isFinite(ms) ? ms : null;
}

function normalizeSmokePath(value: unknown): string {
  const text = String(value ?? "").trim();
  return text ? text.replace(/\\/g, "/") : "";
}

type LatestSmokeFile = {
  file_name: string;
  abs_path: string;
  rel_path: string;
  timestamp_utc: string;
};

async function findLatestSmokeFile(
  dirPath: string,
  fileNameRe: RegExp,
  relDirPath: string,
): Promise<LatestSmokeFile | null> {
  if (!(await pathExists(dirPath))) return null;
  const entries = await readdir(dirPath, { withFileTypes: true }).catch(() => []);
  const names = entries
    .filter((entry) => entry.isFile() && fileNameRe.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (!names.length) return null;
  const fileName = names[names.length - 1];
  return {
    file_name: fileName,
    abs_path: path.join(dirPath, fileName),
    rel_path: path.posix.join(relDirPath, fileName),
    timestamp_utc: parseTimestampFromFileName(fileName, fileNameRe),
  };
}

function readPerfMetricSeconds(
  metrics: unknown,
  key: string,
): number | null {
  if (!Array.isArray(metrics)) return null;
  const row = metrics.find((item) => {
    if (!isRecord(item)) return false;
    return String(item.key ?? "").trim() === key;
  });
  if (!isRecord(row)) return null;
  return parseNullableNumber(row.time_total);
}

type SmokeStatusFlag = "pass" | "fail" | "missing" | "invalid";
type SmokeResult = "PASS" | "FAIL" | "MISSING" | "INVALID";

function buildSmokeStatusSkeleton(
  status: SmokeStatusFlag,
  result: SmokeResult,
  overrides?: Partial<{
    timestamp_utc: string;
    path: string;
    age_sec: number | null;
    parse_error: string;
  }>,
) {
  return {
    status,
    result,
    ok: status === "pass",
    timestamp_utc: overrides?.timestamp_utc ?? "",
    age_sec: overrides?.age_sec ?? null,
    path: overrides?.path ?? "",
    sources: {
      perf_report: "",
      forensics_report: "",
    },
    perf: {
      ok: false,
      agent_runtime_sec: null as number | null,
      provider_sessions_30_sec: null as number | null,
      threads_60_sec: null as number | null,
      threads_160_sec: null as number | null,
    },
    forensics: {
      result: "",
      analyze_status: null as number | null,
      cleanup_status: null as number | null,
      cleanup_token_valid: null as boolean | null,
    },
    parse_error: overrides?.parse_error ?? "",
  };
}

async function buildSmokeStatusFromRawReports(roots: SmokeStatusRoots) {
  const latestPerf = await findLatestSmokeFile(
    roots.perf_dir_abs,
    PERF_SMOKE_FILE_RE,
    roots.perf_dir_rel,
  );
  const latestForensics = await findLatestSmokeFile(
    roots.forensics_dir_abs,
    FORENSICS_SMOKE_FILE_RE,
    roots.forensics_dir_rel,
  );
  if (!latestPerf && !latestForensics) return null;

  const issues: string[] = [];
  const perfRaw = latestPerf
    ? safeJsonParse(await readFile(latestPerf.abs_path, "utf-8").catch(() => ""))
    : null;
  const forensicsRaw = latestForensics
    ? safeJsonParse(await readFile(latestForensics.abs_path, "utf-8").catch(() => ""))
    : null;
  const perfObj = isRecord(perfRaw) ? perfRaw : null;
  const forensicsObj = isRecord(forensicsRaw) ? forensicsRaw : null;

  if (latestPerf && !perfObj) issues.push("perf-report-parse-failed");
  if (latestForensics && !forensicsObj) issues.push("forensics-report-parse-failed");

  const perfOk = perfObj ? Boolean(perfObj.ok) : false;
  const forensicsResultRaw = String(forensicsObj?.result ?? "").trim().toUpperCase();
  const forensicsOk = forensicsResultRaw === "PASS";

  const latestTimestamp = [latestPerf?.timestamp_utc ?? "", latestForensics?.timestamp_utc ?? ""]
    .filter(Boolean)
    .sort()
    .at(-1) ?? "";
  const timestampMs = parseSmokeTimestampUtcMs(latestTimestamp);
  const ageSec =
    timestampMs === null
      ? null
      : Math.max(0, Math.round((Date.now() - timestampMs) / 1000));

  let status: SmokeStatusFlag = "invalid";
  let result: SmokeResult = "INVALID";
  if (perfObj && forensicsObj) {
    status = perfOk && forensicsOk ? "pass" : "fail";
    result = perfOk && forensicsOk ? "PASS" : "FAIL";
  }

  const forensicsMetrics = isRecord(forensicsObj?.metrics)
    ? (forensicsObj.metrics as Record<string, unknown>)
    : {};
  const forensicsAnalyze = isRecord(forensicsMetrics.analyze_delete)
    ? (forensicsMetrics.analyze_delete as Record<string, unknown>)
    : {};
  const forensicsCleanup = isRecord(forensicsMetrics.local_cleanup)
    ? (forensicsMetrics.local_cleanup as Record<string, unknown>)
    : {};

  return {
    latest: {
      status,
      result,
      ok: status === "pass",
      timestamp_utc: latestTimestamp,
      age_sec: ageSec,
      path: "",
      sources: {
        perf_report: latestPerf?.rel_path ?? "",
        forensics_report: latestForensics?.rel_path ?? "",
      },
      perf: {
        ok: perfObj ? perfOk : false,
        agent_runtime_sec: readPerfMetricSeconds(perfObj?.metrics, "agent_runtime"),
        provider_sessions_30_sec: readPerfMetricSeconds(
          perfObj?.metrics,
          "provider_sessions_30",
        ),
        threads_60_sec: readPerfMetricSeconds(perfObj?.metrics, "threads_60"),
        threads_160_sec: readPerfMetricSeconds(perfObj?.metrics, "threads_160"),
      },
      forensics: {
        result: forensicsResultRaw,
        analyze_status: parseNullableNumber(forensicsAnalyze.status),
        cleanup_status: parseNullableNumber(forensicsCleanup.status),
        cleanup_token_valid:
          typeof forensicsCleanup.confirm_token_valid === "boolean"
            ? forensicsCleanup.confirm_token_valid
            : null,
      },
      parse_error: issues.join(","),
    },
    history: [] as Array<{ timestamp_utc: string; path: string }>,
  };
}

type SmokeStatusData = {
  generated_at: string;
  summary_dir: string;
  latest: ReturnType<typeof buildSmokeStatusSkeleton>;
  history: Array<{ timestamp_utc: string; path: string }>;
};

const SMOKE_STATUS_CACHE_TTL_MS = 10_000;
const smokeStatusCache = new Map<
  number,
  { expires_at: number; data: SmokeStatusData }
>();
const smokeStatusInflight = new Map<number, Promise<SmokeStatusData>>();

export async function getLatestSmokeStatusTs(options?: {
  historyLimit?: number;
  roots?: SmokeStatusRootOverrides;
  forceRefresh?: boolean;
}) {
  const historyLimit = Math.max(
    1,
    Math.min(20, parseNumber(options?.historyLimit, 6)),
  );
  const roots = resolveSmokeStatusRoots(options?.roots);
  const useDefaultRoots = !options?.roots;
  const forceRefresh = Boolean(options?.forceRefresh);
  const now = Date.now();

  if (useDefaultRoots && !forceRefresh) {
    const cached = smokeStatusCache.get(historyLimit);
    if (cached && cached.expires_at > now) return cached.data;
    const inflight = smokeStatusInflight.get(historyLimit);
    if (inflight) return inflight;
  }

  const compute = async (): Promise<SmokeStatusData> => {
    const summaryDirRelative = roots.summary_dir_rel;
    const generatedAt = nowIsoUtc();

    if (!(await pathExists(roots.summary_dir_abs))) {
      const fallback = await buildSmokeStatusFromRawReports(roots);
      if (fallback) {
        return {
          generated_at: generatedAt,
          summary_dir: summaryDirRelative,
          latest: fallback.latest,
          history: fallback.history,
        };
      }
      return {
        generated_at: generatedAt,
        summary_dir: summaryDirRelative,
        latest: buildSmokeStatusSkeleton("missing", "MISSING"),
        history: [],
      };
    }

    const entries = await readdir(roots.summary_dir_abs, { withFileTypes: true }).catch(
      () => [],
    );
    const summaryFiles = entries
      .filter((entry) => entry.isFile() && SMOKE_SUMMARY_FILE_RE.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    const history = summaryFiles
      .slice(-historyLimit)
      .reverse()
      .map((fileName) => ({
        timestamp_utc: parseSmokeTimestampFromName(fileName),
        path: path.posix.join(summaryDirRelative, fileName),
      }));

    if (!summaryFiles.length) {
      const fallback = await buildSmokeStatusFromRawReports(roots);
      if (fallback) {
        return {
          generated_at: generatedAt,
          summary_dir: summaryDirRelative,
          latest: fallback.latest,
          history: fallback.history,
        };
      }
      return {
        generated_at: generatedAt,
        summary_dir: summaryDirRelative,
        latest: buildSmokeStatusSkeleton("missing", "MISSING"),
        history,
      };
    }

    const latestFileName = summaryFiles[summaryFiles.length - 1];
    const latestPath = path.join(roots.summary_dir_abs, latestFileName);
    const latestTimestamp = parseSmokeTimestampFromName(latestFileName);
    const latestPathRelative = path.posix.join(summaryDirRelative, latestFileName);

    try {
      const raw = await readFile(latestPath, "utf-8");
      const parsed = safeJsonParse(raw);
      if (!isRecord(parsed)) {
        return {
          generated_at: generatedAt,
          summary_dir: summaryDirRelative,
          latest: buildSmokeStatusSkeleton("invalid", "INVALID", {
            timestamp_utc: latestTimestamp,
            path: latestPathRelative,
            parse_error: "invalid-json-structure",
          }),
          history,
        };
      }

      const sourceObj = isRecord(parsed.sources) ? parsed.sources : {};
      const perfObj = isRecord(parsed.perf) ? parsed.perf : {};
      const forensicsObj = isRecord(parsed.forensics) ? parsed.forensics : {};

      const resultRaw = String(parsed.result ?? "").trim().toUpperCase();
      const result: SmokeResult =
        resultRaw === "PASS"
          ? "PASS"
          : resultRaw === "FAIL"
            ? "FAIL"
            : "INVALID";
      const ok = Boolean(parsed.ok);

      const status: SmokeStatusFlag =
        result === "PASS" && ok
          ? "pass"
          : result === "FAIL" || (result === "PASS" && !ok)
            ? "fail"
            : "invalid";

      const timestampUtcCandidate = String(
        parsed.timestamp_utc ?? latestTimestamp,
      )
        .trim()
        .toUpperCase();
      const timestampUtc = /^(\d{8}T\d{6}Z)$/.test(timestampUtcCandidate)
        ? timestampUtcCandidate
        : latestTimestamp;
      const timestampMs = parseSmokeTimestampUtcMs(timestampUtc);
      const ageSec =
        timestampMs === null
          ? null
          : Math.max(0, Math.round((Date.now() - timestampMs) / 1000));

      return {
        generated_at: generatedAt,
        summary_dir: summaryDirRelative,
        latest: {
          status,
          result,
          ok: status === "pass",
          timestamp_utc: timestampUtc,
          age_sec: ageSec,
          path: latestPathRelative,
          sources: {
            perf_report: normalizeSmokePath(sourceObj.perf_report),
            forensics_report: normalizeSmokePath(sourceObj.forensics_report),
          },
          perf: {
            ok: Boolean(perfObj.ok),
            agent_runtime_sec: parseNullableNumber(perfObj.agent_runtime_sec),
            provider_sessions_30_sec: parseNullableNumber(
              perfObj.provider_sessions_30_sec,
            ),
            threads_60_sec: parseNullableNumber(perfObj.threads_60_sec),
            threads_160_sec: parseNullableNumber(perfObj.threads_160_sec),
          },
          forensics: {
            result: String(forensicsObj.result ?? "").trim().toUpperCase(),
            analyze_status: parseNullableNumber(forensicsObj.analyze_status),
            cleanup_status: parseNullableNumber(forensicsObj.cleanup_status),
            cleanup_token_valid:
              typeof forensicsObj.cleanup_token_valid === "boolean"
                ? forensicsObj.cleanup_token_valid
                : null,
          },
          parse_error: "",
        },
        history,
      };
    } catch (error) {
      return {
        generated_at: generatedAt,
        summary_dir: summaryDirRelative,
        latest: buildSmokeStatusSkeleton("invalid", "INVALID", {
          timestamp_utc: latestTimestamp,
          path: latestPathRelative,
          parse_error: String(error),
        }),
        history,
      };
    }
  };

  if (!useDefaultRoots) {
    return compute();
  }

  const inflight = compute()
    .then((data) => {
      smokeStatusCache.set(historyLimit, {
        expires_at: Date.now() + SMOKE_STATUS_CACHE_TTL_MS,
        data,
      });
      return data;
    })
    .finally(() => {
      smokeStatusInflight.delete(historyLimit);
    });
  smokeStatusInflight.set(historyLimit, inflight);
  return inflight;
}
