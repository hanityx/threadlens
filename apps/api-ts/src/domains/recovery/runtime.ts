/**
 * Recovery center, runtime health, and data-source inventory.
 */

import {
  mkdir,
  stat,
  writeFile,
  chmod,
} from "node:fs/promises";
import path from "node:path";
import {
  START_TS,
  CODEX_HOME,
  BACKUP_ROOT,
  RECOVERY_EXPORT_ROOT,
  RECOVERY_PLAN_DIR,
} from "./constants.js";
import {
  pathExists,
  walkFiles,
  nowIsoUtc,
  quickFileCount,
  countJsonlFilesRecursive,
} from "../../lib/utils.js";
import { isCleanupBackupId, scanBackupSets } from "./backups.js";
import { loadRecoveryChecklist } from "./checklist.js";

export { updateRecoveryChecklistItem } from "./checklist.js";
export {
  exportRecoveryBackupsTs,
  openRecoveryBackupArchiveReadStream,
  resolveRecoveryBackupArchivePath,
} from "./export.js";
export { getLatestSmokeStatusTs } from "./smoke.js";

/* ─────────────────────────────────────────────────────────────────── *
 *  Backup scanning & restore plans                                    *
 * ─────────────────────────────────────────────────────────────────── */

type RecoveryItem = {
  src: string;
  dst: string;
  rel: string;
};

const LEGACY_BACKUP_ROOT = path.join(CODEX_HOME, "local_cleanup_backups");

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

export async function getRuntimeHealthTs() {
  const nowMs = Date.now();
  const uptimeSec = Math.max(0, (nowMs - START_TS) / 1000);
  const hours = Math.floor(uptimeSec / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);
  const seconds = Math.floor(uptimeSec % 60);
  const uptimeHuman = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const roots = {
    codex_root: await pathExists(CODEX_HOME),
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
