/**
 * Recovery center, runtime health, data-source inventory,
 * compare-apps status, and roadmap operations.
 */

import {
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
  RECOVERY_CHECKLIST_FILE,
  RECOVERY_PLAN_DIR,
  HOME_DIR,
  CHAT_DIR,
  CLAUDE_HOME,
  CLAUDE_PROJECTS_DIR,
  GEMINI_HOME,
  GEMINI_TMP_DIR,
  COPILOT_VSCODE_GLOBAL,
  COPILOT_CURSOR_GLOBAL,
  ROADMAP_STATE_FILE,
  ROADMAP_LOG_FILE,
} from "./constants.js";
import {
  pathExists,
  readJsonFile,
  walkFiles,
  isRecord,
  nowIsoUtc,
  cleanTitleText,
  parseNumber,
  runCmdText,
  safeJsonParse,
  countDirsWithPrefix,
  quickFileCount,
  countJsonlFilesRecursive,
  scanPathStatsTs,
  requestPythonJson,
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
    { id: "backup_exists", label: "최신 백업 세트 존재 확인", done: false },
    { id: "dry_run_ok", label: "정리 dry-run 결과 확인", done: false },
    { id: "token_verified", label: "실행 토큰 검증", done: false },
    { id: "drill_run", label: "복구 드릴 실행/검토", done: false },
    { id: "post_verify", label: "실행 후 상태 검증", done: false },
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

type RecoveryBackupCandidate = {
  backup_id: string;
  path: string;
  rank: number;
  mtime_ms: number;
};

function isCleanupBackupId(name: string): boolean {
  return /^\d{8}T\d{6}Z$/.test(String(name || "").trim());
}

async function listBackupCandidates(): Promise<RecoveryBackupCandidate[]> {
  const entries = await readdir(BACKUP_ROOT, { withFileTypes: true });
  const out: RecoveryBackupCandidate[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const backupId = entry.name;
    const fullPath = path.join(BACKUP_ROOT, backupId);
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

async function scanBackupSets(limit = 20): Promise<RecoveryBackupSet[]> {
  try {
    const candidates = await listBackupCandidates();
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

export async function getRecoveryCenterDataTs() {
  const backupSets = await scanBackupSets(20);
  const checklist = await loadRecoveryChecklist();
  const checklistDone = checklist.filter((item) => item.done).length;
  return {
    generated_at: nowIsoUtc(),
    backup_root: BACKUP_ROOT,
    plan_root: RECOVERY_PLAN_DIR,
    backup_sets: backupSets,
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

/* ─────────────────────────────────────────────────────────────────── *
 *  Compare-apps status                                                *
 * ─────────────────────────────────────────────────────────────────── */

export async function getCompareAppsStatusTs() {
  const codexSessionPath = "/Applications/CodexSession.app";
  const codexSessionRunning = Boolean(
    runCmdText("pgrep -fl 'CodexSession.app/Contents/MacOS/codex-session'"),
  );

  let projectAlphaBin = runCmdText("command -v project-alpha");
  if (!projectAlphaBin) {
    const fallback = path.join(HOME_DIR, ".npm-global", "bin", "project-alpha");
    if (await pathExists(fallback)) projectAlphaBin = fallback;
  }
  const projectAlphaRunning = Boolean(runCmdText("pgrep -fl project-alpha"));
  const tmuxLs = runCmdText("tmux ls");
  const projectAlphaTmux = tmuxLs
    .split("\n")
    .some((line) => line.trim().startsWith("project-alpha-app:"));

  const overviewRunning = Boolean(
    runCmdText("lsof -nP -iTCP:8787 -sTCP:LISTEN"),
  );

  const apps = [
    {
      id: "codex-session",
      name: "Codex Session",
      installed: await pathExists(codexSessionPath),
      running: codexSessionRunning,
      location: codexSessionPath,
      start_cmd: "open -a CodexSession",
      watch_cmd: "",
      notes: "Alternative GUI client for Codex",
    },
    {
      id: "project-alpha",
      name: "Project Alpha",
      installed: Boolean(projectAlphaBin),
      running: projectAlphaRunning,
      location: projectAlphaBin || "(not found)",
      start_cmd: "project-alpha",
      watch_cmd: "tmux attach -t project-alpha-app",
      notes: "tmux-based worktree/session manager",
      tmux_session_ready: projectAlphaTmux,
    },
    {
      id: "codex-overview",
      name: "Codex Mission Control",
      installed: await pathExists(PROJECT_ROOT),
      running: overviewRunning,
      location: path.join(PROJECT_ROOT, "server.py"),
      start_cmd: `tmux new-session -d -s codex-overview-server \"cd ${PROJECT_ROOT} && python3 server.py\"`,
      watch_cmd: "tmux attach -t codex-overview-server",
      notes: "Local observability dashboard (this project)",
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

export async function getLatestSmokeStatusTs(options?: {
  historyLimit?: number;
  roots?: SmokeStatusRootOverrides;
}) {
  const historyLimit = Math.max(
    1,
    Math.min(20, parseNumber(options?.historyLimit, 6)),
  );
  const roots = resolveSmokeStatusRoots(options?.roots);
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
}

/* ─────────────────────────────────────────────────────────────────── *
 *  Data-source inventory                                              *
 * ─────────────────────────────────────────────────────────────────── */

export async function getDataSourceInventoryTs() {
  const historyPath = path.join(CODEX_HOME, "history.jsonl");
  const globalStatePath = path.join(CODEX_HOME, ".codex-global-state.json");

  // Root-level inventories are intentionally shallow to keep first load fast.
  // Detailed counts still come from dedicated session paths below.
  const codexRoot = await scanPathStatsTs(CODEX_HOME, false, "*");
  const chatRoot = await scanPathStatsTs(CHAT_DIR, false, "*");
  const claudeRoot = await scanPathStatsTs(CLAUDE_HOME, false, "*");
  const claudeProjects = await scanPathStatsTs(
    CLAUDE_PROJECTS_DIR,
    false,
    "*.jsonl",
  );
  const geminiRoot = await scanPathStatsTs(GEMINI_HOME, false, "*");
  const geminiTmp = await scanPathStatsTs(GEMINI_TMP_DIR, false, "*.jsonl");
  const copilotVsCode = await scanPathStatsTs(
    COPILOT_VSCODE_GLOBAL,
    false,
    "*",
  );
  const copilotCursor = await scanPathStatsTs(
    COPILOT_CURSOR_GLOBAL,
    false,
    "*",
  );
  const sessions = await scanPathStatsTs(
    path.join(CODEX_HOME, "sessions"),
    true,
    "*.jsonl",
  );
  const archivedSessions = await scanPathStatsTs(
    path.join(CODEX_HOME, "archived_sessions"),
    true,
    "*.jsonl",
  );
  const history = await scanPathStatsTs(historyPath, false, "*");
  const globalState = await scanPathStatsTs(globalStatePath, false, "*");

  return {
    generated_at: nowIsoUtc(),
    sources: {
      codex_root: codexRoot,
      chat_root: chatRoot,
      claude_root: claudeRoot,
      claude_projects: claudeProjects,
      gemini_root: geminiRoot,
      gemini_tmp: geminiTmp,
      copilot_vscode: copilotVsCode,
      copilot_cursor: copilotCursor,
      sessions,
      archived_sessions: archivedSessions,
      history: {
        path: historyPath,
        present: await pathExists(historyPath),
        size_bytes: history.total_bytes,
        mtime: history.latest_mtime,
      },
      global_state: {
        path: globalStatePath,
        present: await pathExists(globalStatePath),
        size_bytes: globalState.total_bytes,
        mtime: globalState.latest_mtime,
      },
    },
  };
}

/* ─────────────────────────────────────────────────────────────────── *
 *  Roadmap                                                            *
 * ─────────────────────────────────────────────────────────────────── */

async function readRoadmapState(): Promise<Record<string, unknown>[]> {
  const data = await readJsonFile(ROADMAP_STATE_FILE);
  if (Array.isArray(data)) {
    return data.filter((x) => isRecord(x));
  }
  if (isRecord(data) && Array.isArray(data.weeks)) {
    return data.weeks.filter((x) => isRecord(x));
  }
  return [];
}

async function readRoadmapCheckins(
  limit = 80,
): Promise<Record<string, unknown>[]> {
  try {
    const raw = await readFile(ROADMAP_LOG_FILE, "utf-8");
    const rows = raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => safeJsonParse(line))
      .filter((x): x is Record<string, unknown> => isRecord(x));
    if (limit <= 0) return rows;
    return rows.slice(-limit);
  } catch {
    return [];
  }
}

export async function getRoadmapStatusTs() {
  const weeks = await readRoadmapState();
  const checkins = await readRoadmapCheckins(80);
  const statusCounts: Record<string, number> = {
    done: 0,
    in_progress: 0,
    planned: 0,
    blocked: 0,
  };
  for (const week of weeks) {
    const raw = String(week.status ?? "planned");
    const status = Object.prototype.hasOwnProperty.call(statusCounts, raw)
      ? raw
      : "planned";
    statusCounts[status] += 1;
  }
  const remainingTracks = weeks
    .filter((week) => String(week.status ?? "") !== "done")
    .map((week) => String(week.week_id ?? ""))
    .filter(Boolean);

  return {
    generated_at: nowIsoUtc(),
    status_counts: statusCounts,
    remaining_tracks: remainingTracks,
    weeks,
    checkins,
  };
}

export async function appendRoadmapCheckinTs(note: string, actor: string) {
  let overview: Record<string, unknown> = {};
  let runtime: Record<string, unknown> = {};
  let apps: Record<string, unknown> = {};

  try {
    const o = await requestPythonJson("/api/overview", "GET", {
      query: { include_threads: "0" },
      timeoutMs: 14000,
    });
    if (isRecord(o.payload)) overview = o.payload;
  } catch {
    // no-op
  }
  try {
    const r = await requestPythonJson("/api/runtime-health", "GET", {
      timeoutMs: 8000,
    });
    if (isRecord(r.payload)) runtime = r.payload;
  } catch {
    // no-op
  }
  try {
    const a = await requestPythonJson("/api/compare-apps", "GET", {
      timeoutMs: 8000,
    });
    if (isRecord(a.payload)) apps = a.payload;
  } catch {
    // no-op
  }

  const summary = isRecord(overview.summary) ? overview.summary : {};
  const risk = isRecord(overview.risk_summary) ? overview.risk_summary : {};
  const appSummary = isRecord(apps.summary) ? apps.summary : {};

  const highRisk = parseNumber(summary.high_risk_threads);
  const ctxHigh = parseNumber(risk.ctx_high_total);
  const orphan = parseNumber(risk.orphan_candidates);
  const lightweightHealthScore = Math.max(
    0,
    100 -
      Math.min(
        75,
        highRisk * 4 + Math.floor(ctxHigh / 4) + Math.floor(orphan / 3),
      ),
  );

  const entry = {
    ts: nowIsoUtc(),
    actor: actor || "codex",
    note: cleanTitleText(note || "", 280),
    snapshot: {
      threads: parseNumber(summary.thread_total),
      high_risk: highRisk,
      ctx_high: ctxHigh,
      orphan,
      health_score: lightweightHealthScore,
      running_apps: parseNumber(appSummary.running_total),
      uptime_min: parseNumber(runtime.uptime_min, 0),
    },
  };

  await mkdir(path.dirname(ROADMAP_LOG_FILE), { recursive: true });
  await writeFile(ROADMAP_LOG_FILE, `${JSON.stringify(entry, null, 0)}\n`, {
    encoding: "utf-8",
    flag: "a",
  });
  return entry;
}
