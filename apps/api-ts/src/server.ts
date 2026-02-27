import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import { execSync } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile, chmod, open, copyFile, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AgentRuntimeState,
  ApiEnvelope,
  BulkThreadAction,
  BulkThreadActionRequest,
  BulkThreadActionResult,
  SCHEMA_VERSION,
} from "@codex/shared-contracts";
import { z } from "zod";

const DEFAULT_PORT = Number(process.env.API_TS_PORT ?? 8788);
const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL ?? "http://127.0.0.1:8787";
const APP_VERSION = process.env.APP_VERSION ?? "0.1.0";
const START_TS = Date.now();
const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(THIS_DIR, "../../..");
const ROADMAP_STATE_FILE = path.join(PROJECT_ROOT, "roadmap_state.json");
const ROADMAP_LOG_FILE = path.join(PROJECT_ROOT, "roadmap_checkins.jsonl");
const RECOVERY_CHECKLIST_FILE = path.join(PROJECT_ROOT, "w4_checklist.json");
const RECOVERY_PLAN_DIR = path.join(PROJECT_ROOT, "recovery_plans");
const CODEX_HOME = process.env.CODEX_HOME ?? path.join(process.env.HOME ?? "", ".codex");
const BACKUP_ROOT = path.join(CODEX_HOME, "local_cleanup_backups");
const THREADS_BOOT_CACHE_FILE = path.join(PROJECT_ROOT, ".run", "threads_boot_cache.json");
const HOME_DIR = process.env.HOME ?? "";
const CHAT_DIR = path.join(HOME_DIR, "Library", "Application Support", "com.openai.chat");
const CLAUDE_HOME = path.join(HOME_DIR, ".claude");
const CLAUDE_PROJECTS_DIR = path.join(CLAUDE_HOME, "projects");
const GEMINI_HOME = path.join(HOME_DIR, ".gemini");
const GEMINI_TMP_DIR = path.join(GEMINI_HOME, "tmp");
const COPILOT_VSCODE_GLOBAL = path.join(
  HOME_DIR,
  "Library",
  "Application Support",
  "Code",
  "User",
  "globalStorage",
  "github.copilot-chat",
);
const COPILOT_CURSOR_GLOBAL = path.join(
  HOME_DIR,
  "Library",
  "Application Support",
  "Cursor",
  "User",
  "globalStorage",
  "github.copilot-chat",
);

const directApiPaths = new Set([
  "/api/healthz",
  "/api/version",
  "/api/agent-runtime",
  "/api/bulk-thread-action",
  "/api/roadmap-status",
  "/api/roadmap-checkin",
  "/api/threads",
  "/api/thread-pin",
  "/api/thread-archive-local",
  "/api/thread-resume-command",
  "/api/analyze-delete",
  "/api/local-cleanup",
  "/api/recovery-center",
  "/api/recovery-drill",
  "/api/recovery-checklist",
  "/api/compare-apps",
  "/api/runtime-health",
  "/api/data-sources",
  "/api/provider-matrix",
  "/api/provider-sessions",
  "/api/provider-parser-health",
  "/api/provider-session-action",
  "/api/agent-loops",
  "/api/agent-loops/action",
  "/api/alert-hooks",
  "/api/alert-hooks/config",
  "/api/alert-hooks/rule",
  "/api/alert-hooks/evaluate",
  "/api/overview",
  "/api/codex-observatory",
  "/api/rename-thread",
  "/api/thread-forensics",
]);

const proxiedApiPaths = new Set([
  "/api/threads",
  "/api/thread-pin",
  "/api/thread-archive-local",
  "/api/thread-resume-command",
  "/api/analyze-delete",
  "/api/local-cleanup",
]);

function envelope<T>(data: T | null, error: string | null = null): ApiEnvelope<T> {
  return {
    ok: !error,
    schema_version: SCHEMA_VERSION,
    data,
    error,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 2500): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function withSchemaVersion(payload: unknown): unknown {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    if (!record.schema_version) {
      return { ...record, schema_version: SCHEMA_VERSION };
    }
    return payload;
  }
  return envelope(payload, null);
}

function getTmuxSessions(): string[] {
  const out = runCmdText("tmux ls -F '#S'", 700);
  if (!out) return [];
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function runCmdText(command: string, timeout = 4000): string {
  try {
    const out = execSync(command, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout,
      shell: "/bin/zsh",
    });
    return String(out || "").trim();
  } catch {
    return "";
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function getAgentRuntimeState(): Promise<AgentRuntimeState> {
  const nowMs = Date.now();
  if (runtimeStateCache && runtimeStateCache.expires_at > nowMs) return runtimeStateCache.payload;
  if (runtimeStateInflight) return runtimeStateInflight;

  runtimeStateInflight = (async () => {
  const now = new Date().toISOString();
  let start = Date.now();
  let reachable = false;
  let latencyMs: number | null = null;

  try {
    const res = await fetchWithTimeout(`${PYTHON_BACKEND_URL}/api/runtime-health`, {}, 1200);
    reachable = res.ok;
    latencyMs = Date.now() - start;
  } catch {
    try {
      start = Date.now();
      const fallback = await fetchWithTimeout(`${PYTHON_BACKEND_URL}/api/overview?include_threads=0`, {}, 1800);
      reachable = fallback.ok;
      latencyMs = Date.now() - start;
    } catch {
      reachable = false;
      latencyMs = null;
    }
  }

  const sessions = getTmuxSessions();

  return {
    ts: now,
    python_backend: {
      url: PYTHON_BACKEND_URL,
      reachable,
      latency_ms: latencyMs,
    },
    process: {
      pid: process.pid,
      uptime_sec: Math.round(process.uptime()),
      node: process.version,
    },
    tmux: {
      has_tmux: sessions.length > 0,
      sessions,
    },
  };
  })()
    .then((payload) => {
      runtimeStateCache = {
        expires_at: Date.now() + RUNTIME_CACHE_TTL_MS,
        payload,
      };
      return payload;
    })
    .finally(() => {
      runtimeStateInflight = null;
    });

  return runtimeStateInflight;
}

const bulkRequestSchema = z.object({
  action: z.enum(["pin", "unpin", "archive_local", "resume_command"]),
  thread_ids: z.array(z.string().min(1)).min(1).max(500),
});

type ProxyRequest = FastifyRequest<{
  Params: { "*": string };
  Querystring: Record<string, string | string[] | undefined>;
  Body: unknown;
}>;

type QueryMap = Record<string, string | string[] | undefined>;

type RuntimeCacheEntry = {
  expires_at: number;
  payload: AgentRuntimeState;
};

type ThreadsCacheEntry = {
  expires_at: number;
  status: number;
  payload: unknown;
};

const RUNTIME_CACHE_TTL_MS = 8_000;
const THREADS_CACHE_TTL_MS = 12_000;
const THREADS_STALE_TTL_MS = 120_000;
let runtimeStateCache: RuntimeCacheEntry | null = null;
let runtimeStateInflight: Promise<AgentRuntimeState> | null = null;
const threadsCache = new Map<string, ThreadsCacheEntry>();
const threadsInflight = new Map<string, Promise<{ status: number; payload: unknown } | null>>();
let threadsBootCacheLoaded = false;

function canonicalizeQuery(query?: QueryMap): string {
  if (!query) return "";
  const keys = Object.keys(query).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const value = query[key];
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      [...value].sort().forEach((item) => {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(item)}`);
      });
      continue;
    }
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return parts.join("&");
}

function parseQueryString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return String(value[0] ?? "");
  return String(value ?? "");
}

function parseQueryNumber(value: string | string[] | undefined, fallback: number): number {
  const n = Number(parseQueryString(value));
  return Number.isFinite(n) ? n : fallback;
}

function isBootThreadsQuery(query: QueryMap): boolean {
  const offset = parseQueryNumber(query.offset, 0);
  const limit = parseQueryNumber(query.limit, 160);
  const q = parseQueryString(query.q);
  const sort = parseQueryString(query.sort);
  return offset === 0 && limit <= 160 && q.trim() === "" && (sort === "" || sort === "updated_desc");
}

function buildProxyUrl(pathname: string, query?: Record<string, string | string[] | undefined>): string {
  const url = new URL(pathname, PYTHON_BACKEND_URL);
  if (!query) return url.toString();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      value.forEach((v) => url.searchParams.append(key, v));
    } else if (value !== undefined) {
      url.searchParams.append(key, value);
    }
  }
  return url.toString();
}

async function requestPythonJson(
  pathname: string,
  method: "GET" | "POST",
  options: {
    query?: QueryMap;
    body?: unknown;
    timeoutMs?: number;
  } = {},
): Promise<{ status: number; payload: unknown }> {
  const url = buildProxyUrl(pathname, options.query);
  const headers: Record<string, string> = { accept: "application/json" };
  let body: string | undefined;
  if (method === "POST") {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body ?? {});
  }

  const res = await fetchWithTimeout(
    url,
    {
      method,
      headers,
      body,
    },
    options.timeoutMs ?? 12000,
  );
  const text = await res.text();
  const parsed = safeJsonParse(text);
  return {
    status: res.status,
    payload: withSchemaVersion(parsed ?? text),
  };
}

async function getCachedThreads(query: QueryMap): Promise<{ status: number; payload: unknown }> {
  const key = canonicalizeQuery(query);
  const nowMs = Date.now();
  const cached = threadsCache.get(key);
  if (cached && cached.expires_at > nowMs) {
    return { status: cached.status, payload: cached.payload };
  }

  if (!cached && isBootThreadsQuery(query) && !threadsBootCacheLoaded) {
    threadsBootCacheLoaded = true;
    try {
      const raw = await readFile(THREADS_BOOT_CACHE_FILE, "utf-8");
      const parsed = safeJsonParse(raw);
      if (isRecord(parsed) && typeof parsed.status === "number" && Object.prototype.hasOwnProperty.call(parsed, "payload")) {
        const status = Number(parsed.status);
        const payload = withSchemaVersion(parsed.payload);
        threadsCache.set(key, {
          expires_at: nowMs + THREADS_CACHE_TTL_MS,
          status,
          payload,
        });
        const warm = threadsCache.get(key);
        if (warm) {
          void getCachedThreadsRefresh(query, key);
          return { status: warm.status, payload: warm.payload };
        }
      }
    } catch {
      // no boot cache file
    }
  }

  if (cached) {
    void getCachedThreadsRefresh(query, key);
    return { status: cached.status, payload: cached.payload };
  }

  const fresh = await getCachedThreadsRefresh(query, key);
  if (fresh) return fresh;

  const fallback = threadsCache.get(key);
  if (fallback) return { status: fallback.status, payload: fallback.payload };
  throw new Error("threads-refresh-failed");
}

async function getCachedThreadsRefresh(query: QueryMap, key: string): Promise<{ status: number; payload: unknown } | null> {
  const inflight = threadsInflight.get(key);
  if (inflight) return inflight;

  const task = requestPythonJson("/api/threads", "GET", { query, timeoutMs: 12000 })
    .then((result) => {
      threadsCache.set(key, {
        expires_at: Date.now() + THREADS_CACHE_TTL_MS,
        status: result.status,
        payload: result.payload,
      });
      if (isBootThreadsQuery(query)) {
        void mkdir(path.dirname(THREADS_BOOT_CACHE_FILE), { recursive: true })
          .then(() =>
            writeFile(
              THREADS_BOOT_CACHE_FILE,
              JSON.stringify({ status: result.status, payload: result.payload }, null, 0),
              "utf-8",
            ),
          )
          .catch(() => {
            // ignore boot cache write failure
          });
      }
      return result;
    })
    .catch(() => {
      const stale = threadsCache.get(key);
      if (stale && stale.expires_at + THREADS_STALE_TTL_MS > Date.now()) {
        return { status: stale.status, payload: stale.payload };
      }
      return null;
    })
    .finally(() => {
      threadsInflight.delete(key);
    });

  threadsInflight.set(key, task);
  return task;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nowIsoUtc(): string {
  return new Date().toISOString();
}

function cleanTitleText(text: string, maxLen = 280): string {
  const t = String(text || "").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1).trim()}…`;
}

async function readJsonFile(filePath: string): Promise<unknown> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

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

async function readRoadmapCheckins(limit = 80): Promise<Record<string, unknown>[]> {
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

function parseNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

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
  await writeFile(RECOVERY_CHECKLIST_FILE, JSON.stringify({ items }, null, 2), "utf-8");
}

async function updateRecoveryChecklistItem(itemId: string, done: boolean) {
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

async function walkFiles(root: string, maxItems = Number.MAX_SAFE_INTEGER): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        out.push(full);
        if (out.length >= maxItems) return;
      }
    }
  }
  await walk(root);
  return out;
}

async function scanBackupSets(limit = 20): Promise<RecoveryBackupSet[]> {
  try {
    const entries = await readdir(BACKUP_ROOT, { withFileTypes: true });
    const dirs = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => b.localeCompare(a))
      .slice(0, Math.max(1, limit));

    const result: RecoveryBackupSet[] = [];
    for (const backupId of dirs) {
      const root = path.join(BACKUP_ROOT, backupId);
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
        backup_id: backupId,
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

async function buildRestorePlan(backupDir: string, maxFiles = 400): Promise<{ ok: boolean; error?: string; plan_path?: string; items?: RecoveryItem[] }> {
  try {
    const files = await walkFiles(backupDir, maxFiles);
    const items: RecoveryItem[] = files.map((src) => {
      const rel = path.relative(backupDir, src);
      const dst = path.join("/", rel);
      return { src, dst, rel };
    });

    const ts = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
    await mkdir(RECOVERY_PLAN_DIR, { recursive: true });
    const planPath = path.join(RECOVERY_PLAN_DIR, `restore-plan-${ts}.sh`);

    const lines = [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `# generated_at=${nowIsoUtc()}`,
      `# backup_dir=${backupDir}`,
      "# dry-run style restore preview script (manual review required)",
      "",
    ];
    for (const item of items) {
      const parent = path.dirname(item.dst).replace(/"/g, '\\"');
      const src = item.src.replace(/"/g, '\\"');
      const dst = item.dst.replace(/"/g, '\\"');
      lines.push(`mkdir -p "${parent}"`);
      lines.push(`cp -f "${src}" "${dst}"`);
    }
    await writeFile(planPath, `${lines.join("\n")}\n`, "utf-8");
    await chmod(planPath, 0o700);
    return { ok: true, plan_path: planPath, items };
  } catch (error) {
    return { ok: false, error: String(error), items: [] };
  }
}

async function getRecoveryCenterDataTs() {
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

async function runRecoveryDrillTs() {
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
  const latest = backups[0];
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

async function getCompareAppsStatusTs() {
  const codexiaPath = "/Applications/Codexia.app";
  const codexiaRunning = Boolean(runCmdText("pgrep -fl 'Codexia.app/Contents/MacOS/codexia'"));

  let ccmanagerBin = runCmdText("command -v ccmanager");
  if (!ccmanagerBin) {
    const fallback = path.join(HOME_DIR, ".npm-global", "bin", "ccmanager");
    if (await pathExists(fallback)) ccmanagerBin = fallback;
  }
  const ccmanagerRunning = Boolean(runCmdText("pgrep -fl ccmanager"));
  const tmuxLs = runCmdText("tmux ls");
  const ccmanagerTmux = tmuxLs
    .split("\n")
    .some((line) => line.trim().startsWith("ccmanager-app:"));

  const overviewRunning = Boolean(runCmdText("lsof -nP -iTCP:8787 -sTCP:LISTEN"));

  const apps = [
    {
      id: "codexia",
      name: "Codexia",
      installed: await pathExists(codexiaPath),
      running: codexiaRunning,
      location: codexiaPath,
      start_cmd: "open -a Codexia",
      watch_cmd: "",
      notes: "Codex 앱 대체 GUI 클라이언트",
    },
    {
      id: "ccmanager",
      name: "CCManager",
      installed: Boolean(ccmanagerBin),
      running: ccmanagerRunning,
      location: ccmanagerBin || "(not found)",
      start_cmd: "export PATH=/user-root/developer/.npm-global/bin:$PATH; ccmanager",
      watch_cmd: "tmux attach -t ccmanager-app",
      notes: "tmux 기반 워크트리/세션 매니저",
      tmux_session_ready: ccmanagerTmux,
    },
    {
      id: "codex-overview",
      name: "Codex Mission Control",
      installed: await pathExists(PROJECT_ROOT),
      running: overviewRunning,
      location: path.join(PROJECT_ROOT, "server.py"),
      start_cmd: `tmux new-session -d -s codex-overview-server \"cd ${PROJECT_ROOT} && python3 server.py\"`,
      watch_cmd: "tmux attach -t codex-overview-server",
      notes: "현재 로컬 관제 대시보드",
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

async function countDirsWithPrefix(root: string, prefix: string): Promise<number> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix)).length;
  } catch {
    return 0;
  }
}

async function quickFileCount(root: string): Promise<number> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    return entries.length;
  } catch {
    return 0;
  }
}

async function countJsonlFilesRecursive(root: string, limit = 5000): Promise<number> {
  let count = 0;
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        count += 1;
      }
      if (count >= limit) return;
    }
  }
  try {
    await walk(root);
  } catch {
    return count;
  }
  return count;
}

async function getRuntimeHealthTs() {
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
    archived_sessions_root: await pathExists(path.join(CODEX_HOME, "archived_sessions")),
    history_file: await pathExists(path.join(CODEX_HOME, "history.jsonl")),
    global_state_file: await pathExists(path.join(CODEX_HOME, ".codex-global-state.json")),
  };

  const quickCounts = {
    chat_conversation_dirs: await countDirsWithPrefix(CHAT_DIR, "conversations-v3-"),
    chat_project_dirs: await countDirsWithPrefix(CHAT_DIR, "project-g-p-"),
    sessions_jsonl_files: await countJsonlFilesRecursive(path.join(CODEX_HOME, "sessions")),
    archived_sessions_jsonl_files: await countJsonlFilesRecursive(path.join(CODEX_HOME, "archived_sessions")),
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

function matchesPattern(fileName: string, pattern: string): boolean {
  if (!pattern || pattern === "*") return true;
  if (pattern.startsWith("*.")) {
    return fileName.endsWith(pattern.slice(1));
  }
  return fileName === pattern;
}

async function scanPathStatsTs(targetPath: string, recursive = true, filePattern = "*") {
  const out = {
    path: targetPath,
    exists: false,
    file_count: 0,
    dir_count: 0,
    total_bytes: 0,
    latest_mtime: "",
  };

  if (!(await pathExists(targetPath))) return out;
  out.exists = true;

  const st = await stat(targetPath);
  if (st.isFile()) {
    out.file_count = 1;
    out.total_bytes = Number(st.size);
    out.latest_mtime = new Date(Number(st.mtimeMs)).toISOString();
    return out;
  }

  let latestMtime = 0;
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        out.dir_count += 1;
        if (recursive) await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!matchesPattern(entry.name, filePattern)) continue;
      try {
        const fs = await stat(full);
        out.file_count += 1;
        out.total_bytes += Number(fs.size);
        latestMtime = Math.max(latestMtime, Number(fs.mtimeMs));
      } catch {
        // no-op
      }
    }
  }
  await walk(targetPath);
  out.latest_mtime = latestMtime ? new Date(latestMtime).toISOString() : "";
  return out;
}

async function getDataSourceInventoryTs() {
  const historyPath = path.join(CODEX_HOME, "history.jsonl");
  const globalStatePath = path.join(CODEX_HOME, ".codex-global-state.json");

  const codexRoot = await scanPathStatsTs(CODEX_HOME, true, "*");
  const chatRoot = await scanPathStatsTs(CHAT_DIR, true, "*");
  const claudeRoot = await scanPathStatsTs(CLAUDE_HOME, false, "*");
  const claudeProjects = await scanPathStatsTs(CLAUDE_PROJECTS_DIR, false, "*.jsonl");
  const geminiRoot = await scanPathStatsTs(GEMINI_HOME, false, "*");
  const geminiTmp = await scanPathStatsTs(GEMINI_TMP_DIR, false, "*.jsonl");
  const copilotVsCode = await scanPathStatsTs(COPILOT_VSCODE_GLOBAL, false, "*");
  const copilotCursor = await scanPathStatsTs(COPILOT_CURSOR_GLOBAL, false, "*");
  const sessions = await scanPathStatsTs(path.join(CODEX_HOME, "sessions"), true, "*.jsonl");
  const archivedSessions = await scanPathStatsTs(path.join(CODEX_HOME, "archived_sessions"), true, "*.jsonl");
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

type ProviderId = "codex" | "claude" | "gemini" | "copilot";
type ProviderStatus = "active" | "detected" | "missing";
type ProviderSessionAction = "archive_local" | "delete_local";

function providerStatus(rootExists: boolean, sessionLogs: number): ProviderStatus {
  if (sessionLogs > 0) return "active";
  if (rootExists) return "detected";
  return "missing";
}

function capabilityLevel(status: ProviderStatus, safeCleanup: boolean): "full" | "read-only" | "unavailable" {
  if (safeCleanup) return "full";
  if (status !== "missing") return "read-only";
  return "unavailable";
}

function parseProviderId(raw: unknown): ProviderId | undefined {
  if (raw === "codex" || raw === "claude" || raw === "gemini" || raw === "copilot") return raw;
  return undefined;
}

function isPathInsideRoot(targetPath: string, rootPath: string): boolean {
  const fullTarget = path.resolve(targetPath);
  const fullRoot = path.resolve(rootPath);
  return fullTarget === fullRoot || fullTarget.startsWith(`${fullRoot}${path.sep}`);
}

async function getProviderMatrixTs() {
  const codexRootExists = await pathExists(CODEX_HOME);
  const claudeRootExists = await pathExists(CLAUDE_HOME);
  const geminiRootExists = await pathExists(GEMINI_HOME);
  const copilotVsCodeExists = await pathExists(COPILOT_VSCODE_GLOBAL);
  const copilotCursorExists = await pathExists(COPILOT_CURSOR_GLOBAL);

  const codexSessionLogs =
    (await countJsonlFilesRecursive(path.join(CODEX_HOME, "sessions"))) +
    (await countJsonlFilesRecursive(path.join(CODEX_HOME, "archived_sessions")));
  const claudeSessionLogs = await countJsonlFilesRecursive(CLAUDE_PROJECTS_DIR);
  const geminiSessionLogs = await countJsonlFilesRecursive(GEMINI_TMP_DIR);
  const copilotSignalFiles =
    (await quickFileCount(COPILOT_VSCODE_GLOBAL)) + (await quickFileCount(COPILOT_CURSOR_GLOBAL));

  const claudeStatus = providerStatus(claudeRootExists, claudeSessionLogs);
  const geminiStatus = providerStatus(geminiRootExists, geminiSessionLogs);
  const copilotStatus = providerStatus(copilotVsCodeExists || copilotCursorExists, copilotSignalFiles);

  const providers = [
    {
      provider: "codex" as ProviderId,
      name: "Codex",
      status: providerStatus(codexRootExists, codexSessionLogs),
      capability_level: capabilityLevel(providerStatus(codexRootExists, codexSessionLogs), true),
      capabilities: {
        read_sessions: true,
        analyze_context: true,
        safe_cleanup: true,
        hard_delete: true,
      },
      evidence: {
        roots: [CODEX_HOME, CHAT_DIR],
        session_log_count: codexSessionLogs,
        notes: "full safety cleanup and forensics available",
      },
    },
    {
      provider: "claude" as ProviderId,
      name: "Claude CLI",
      status: claudeStatus,
      capability_level: capabilityLevel(claudeStatus, claudeStatus !== "missing"),
      capabilities: {
        read_sessions: claudeRootExists,
        analyze_context: claudeSessionLogs > 0,
        safe_cleanup: claudeStatus !== "missing",
        hard_delete: claudeStatus !== "missing",
      },
      evidence: {
        roots: [CLAUDE_HOME, CLAUDE_PROJECTS_DIR],
        session_log_count: claudeSessionLogs,
        notes: "dev mode: local archive/delete enabled when storage is detected",
      },
    },
    {
      provider: "gemini" as ProviderId,
      name: "Gemini CLI",
      status: geminiStatus,
      capability_level: capabilityLevel(geminiStatus, geminiStatus !== "missing"),
      capabilities: {
        read_sessions: geminiRootExists,
        analyze_context: geminiSessionLogs > 0,
        safe_cleanup: geminiStatus !== "missing",
        hard_delete: geminiStatus !== "missing",
      },
      evidence: {
        roots: [GEMINI_HOME, GEMINI_TMP_DIR],
        session_log_count: geminiSessionLogs,
        notes: "dev mode: local archive/delete enabled when storage is detected",
      },
    },
    {
      provider: "copilot" as ProviderId,
      name: "Copilot Chat",
      status: copilotStatus,
      capability_level: capabilityLevel(copilotStatus, copilotStatus !== "missing"),
      capabilities: {
        read_sessions: copilotVsCodeExists || copilotCursorExists,
        analyze_context: copilotSignalFiles > 0,
        safe_cleanup: copilotStatus !== "missing",
        hard_delete: copilotStatus !== "missing",
      },
      evidence: {
        roots: [COPILOT_VSCODE_GLOBAL, COPILOT_CURSOR_GLOBAL],
        session_log_count: copilotSignalFiles,
        notes: "dev mode: local archive/delete enabled when storage is detected",
      },
    },
  ];

  const summary = {
    total: providers.length,
    active: providers.filter((x) => x.status === "active").length,
    detected: providers.filter((x) => x.status !== "missing").length,
    read_analyze_ready: providers.filter((x) => x.capabilities.read_sessions && x.capabilities.analyze_context).length,
    safe_cleanup_ready: providers.filter((x) => x.capabilities.safe_cleanup).length,
    hard_delete_ready: providers.filter((x) => x.capabilities.hard_delete).length,
  };

  return {
    generated_at: nowIsoUtc(),
    mode: "multi-provider-phase-1",
    summary,
    providers,
    policy: {
      cleanup_gate: "dev mode: all detected providers can expose cleanup/delete actions",
      default_non_codex: "all providers enabled for local testing",
    },
  };
}

type ProviderSessionProbe = {
  ok: boolean;
  format: "jsonl" | "json" | "unknown";
  error: string | null;
};

type ProviderSessionRow = {
  provider: ProviderId;
  source: string;
  session_id: string;
  file_path: string;
  size_bytes: number;
  mtime: string;
  probe: ProviderSessionProbe;
};

type ProviderSessionScan = {
  provider: ProviderId;
  name: string;
  status: ProviderStatus;
  rows: ProviderSessionRow[];
  scanned: number;
  truncated: boolean;
};

type ProviderRootSpec = {
  source: string;
  root: string;
  exts: string[];
};

type ProviderScanCacheEntry = {
  expires_at: number;
  scan: ProviderSessionScan;
};

const PROVIDER_SCAN_CACHE_TTL_MS = 60_000;
const providerScanCache = new Map<string, ProviderScanCacheEntry>();
const providerScanInflight = new Map<string, Promise<ProviderSessionScan>>();

function providerScanCacheKey(provider: ProviderId, limit: number): string {
  return `${provider}:${limit}`;
}

function providerName(provider: ProviderId): string {
  if (provider === "codex") return "Codex";
  if (provider === "claude") return "Claude CLI";
  if (provider === "gemini") return "Gemini CLI";
  return "Copilot Chat";
}

function inferFormat(filePath: string): "jsonl" | "json" | "unknown" {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jsonl") return "jsonl";
  if (ext === ".json") return "json";
  return "unknown";
}

function inferSessionId(filePath: string): string {
  const base = path.basename(filePath);
  const ext = path.extname(base);
  if (!ext) return base;
  return base.slice(0, -ext.length);
}

async function readFileHead(filePath: string, maxBytes = 8192): Promise<string> {
  let fh: Awaited<ReturnType<typeof open>> | null = null;
  try {
    fh = await open(filePath, "r");
    const buf = Buffer.alloc(maxBytes);
    const { bytesRead } = await fh.read(buf, 0, maxBytes, 0);
    return buf.subarray(0, bytesRead).toString("utf-8");
  } catch {
    return "";
  } finally {
    if (fh) await fh.close();
  }
}

async function walkFilesByExt(root: string, exts: string[], maxItems = 1000): Promise<string[]> {
  const out: string[] = [];
  const extSet = new Set(exts.map((x) => x.toLowerCase()));
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        if (extSet.has(path.extname(entry.name).toLowerCase())) {
          out.push(full);
          if (out.length >= maxItems) return;
        }
      }
      if (out.length >= maxItems) return;
    }
  }
  try {
    await walk(root);
  } catch {
    return out;
  }
  return out;
}

async function probeSessionFile(filePath: string): Promise<ProviderSessionProbe> {
  const format = inferFormat(filePath);
  if (format === "unknown") {
    return { ok: false, format, error: "unsupported extension" };
  }
  const head = await readFileHead(filePath, 12288);
  if (!head.trim()) {
    return { ok: false, format, error: "empty file" };
  }

  if (format === "jsonl") {
    const first = head
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean);
    if (!first) {
      return { ok: false, format, error: "no json line found" };
    }
    try {
      JSON.parse(first);
      return { ok: true, format, error: null };
    } catch (error) {
      return { ok: false, format, error: `invalid json line: ${String(error)}` };
    }
  }

  const prefix = head.trimStart();
  if (!(prefix.startsWith("{") || prefix.startsWith("["))) {
    return { ok: false, format, error: "json prefix not found" };
  }
  return { ok: true, format, error: null };
}

function providerRootSpecs(provider: ProviderId): ProviderRootSpec[] {
  if (provider === "codex") {
    return [
      { source: "sessions", root: path.join(CODEX_HOME, "sessions"), exts: [".jsonl"] },
      { source: "archived_sessions", root: path.join(CODEX_HOME, "archived_sessions"), exts: [".jsonl"] },
    ];
  }
  if (provider === "claude") {
    return [{ source: "projects", root: CLAUDE_PROJECTS_DIR, exts: [".jsonl"] }];
  }
  if (provider === "gemini") {
    return [{ source: "tmp", root: GEMINI_TMP_DIR, exts: [".jsonl", ".json"] }];
  }
  return [
    { source: "vscode", root: COPILOT_VSCODE_GLOBAL, exts: [".jsonl", ".json"] },
    { source: "cursor", root: COPILOT_CURSOR_GLOBAL, exts: [".jsonl", ".json"] },
  ];
}

function isAllowedProviderFilePath(provider: ProviderId, filePath: string): boolean {
  const specs = providerRootSpecs(provider);
  const ext = path.extname(filePath).toLowerCase();
  return specs.some((spec) => spec.exts.includes(ext) && isPathInsideRoot(filePath, spec.root));
}

function providerActionToken(provider: ProviderId, action: ProviderSessionAction, targets: number): string {
  return `provider:${provider}:${action}:${targets}`;
}

async function runProviderSessionAction(
  provider: ProviderId,
  action: ProviderSessionAction,
  filePaths: string[],
  dryRun: boolean,
  confirmToken: string,
) {
  const uniquePaths = Array.from(new Set(filePaths.map((item) => String(item || "").trim()).filter(Boolean)));
  const skipped: Array<{ file_path: string; reason: string }> = [];
  const valid: string[] = [];

  for (const candidate of uniquePaths) {
    if (!isAllowedProviderFilePath(provider, candidate)) {
      skipped.push({ file_path: candidate, reason: "outside-provider-root-or-extension" });
      continue;
    }
    try {
      const st = await stat(candidate);
      if (!st.isFile()) {
        skipped.push({ file_path: candidate, reason: "not-a-file" });
        continue;
      }
      valid.push(candidate);
    } catch {
      skipped.push({ file_path: candidate, reason: "not-found" });
    }
  }

  const expectedToken = providerActionToken(provider, action, valid.length);
  if (!dryRun && confirmToken !== expectedToken) {
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
      skipped,
      error: "confirm-token-mismatch",
    };
  }

  if (dryRun) {
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
      skipped,
      mode: "preview",
    };
  }

  let applied = 0;
  let archivedTo: string | null = null;
  if (action === "archive_local") {
    const folderName = nowIsoUtc().replace(/[:.]/g, "-");
    const destination = path.join(BACKUP_ROOT, "provider_actions", provider, folderName);
    await mkdir(destination, { recursive: true });
    for (let i = 0; i < valid.length; i += 1) {
      const sourcePath = valid[i];
      const base = path.basename(sourcePath);
      const targetPath = path.join(destination, `${provider}-${Date.now()}-${i + 1}-${base}`);
      await copyFile(sourcePath, targetPath);
      await unlink(sourcePath);
      applied += 1;
    }
    archivedTo = destination;
  } else {
    for (const sourcePath of valid) {
      await unlink(sourcePath);
      applied += 1;
    }
  }

  for (const key of providerScanCache.keys()) {
    if (key.startsWith(`${provider}:`)) {
      providerScanCache.delete(key);
    }
  }

  return {
    ok: true,
    provider,
    action,
    dry_run: false,
    target_count: uniquePaths.length,
    valid_count: valid.length,
    applied_count: applied,
    confirm_token_expected: expectedToken,
    confirm_token_accepted: true,
    skipped,
    archived_to: archivedTo,
    mode: "applied",
  };
}

async function scanProviderSessions(provider: ProviderId, limit = 80): Promise<ProviderSessionScan> {
  const safeLimit = Math.max(1, Math.min(240, Number(limit) || 80));
  const roots = providerRootSpecs(provider);
  const rootExists = (await Promise.all(roots.map((r) => pathExists(r.root)))).some(Boolean);

  const candidates: Array<{ source: string; file_path: string; size_bytes: number; mtime: string; mtime_ms: number }> = [];
  const gatherLimit = Math.max(safeLimit * 2, 80);

  const rootFiles = await Promise.all(roots.map((spec) => walkFilesByExt(spec.root, spec.exts, gatherLimit)));
  for (let i = 0; i < roots.length; i += 1) {
    const spec = roots[i];
    const files = rootFiles[i] ?? [];
    for (const file of files) {
      try {
        const st = await stat(file);
        candidates.push({
          source: spec.source,
          file_path: file,
          size_bytes: Number(st.size),
          mtime: new Date(Number(st.mtimeMs)).toISOString(),
          mtime_ms: Number(st.mtimeMs),
        });
      } catch {
        // no-op
      }
    }
  }

  candidates.sort((a, b) => b.mtime_ms - a.mtime_ms);
  const selected = candidates.slice(0, safeLimit);
  const rows: ProviderSessionRow[] = await Promise.all(
    selected.map(async (candidate) => ({
      provider,
      source: candidate.source,
      session_id: inferSessionId(candidate.file_path),
      file_path: candidate.file_path,
      size_bytes: candidate.size_bytes,
      mtime: candidate.mtime,
      probe: await probeSessionFile(candidate.file_path),
    })),
  );

  return {
    provider,
    name: providerName(provider),
    status: providerStatus(rootExists, candidates.length),
    rows,
    scanned: rows.length,
    truncated: candidates.length > safeLimit,
  };
}

async function getProviderSessionScan(provider: ProviderId, limit = 80): Promise<ProviderSessionScan> {
  const safeLimit = Math.max(1, Math.min(240, Number(limit) || 80));
  const key = providerScanCacheKey(provider, safeLimit);
  const now = Date.now();
  const cached = providerScanCache.get(key);
  if (cached && cached.expires_at > now) return cached.scan;

  const inflight = providerScanInflight.get(key);
  if (inflight) return inflight;

  const task = scanProviderSessions(provider, safeLimit)
    .then((scan) => {
      providerScanCache.set(key, { expires_at: Date.now() + PROVIDER_SCAN_CACHE_TTL_MS, scan });
      return scan;
    })
    .finally(() => {
      providerScanInflight.delete(key);
    });

  providerScanInflight.set(key, task);
  return task;
}

async function getProviderSessionsTs(provider?: ProviderId, limit = 80) {
  const targets: ProviderId[] = provider ? [provider] : ["codex", "claude", "gemini", "copilot"];
  const scans = await Promise.all(targets.map((p) => getProviderSessionScan(p, limit)));

  const rows = scans.flatMap((scan) => scan.rows);
  return {
    generated_at: nowIsoUtc(),
    summary: {
      providers: scans.length,
      rows: rows.length,
      parse_ok: rows.filter((row) => row.probe.ok).length,
      parse_fail: rows.filter((row) => !row.probe.ok).length,
    },
    providers: scans.map((scan) => ({
      provider: scan.provider,
      name: scan.name,
      status: scan.status,
      scanned: scan.scanned,
      truncated: scan.truncated,
    })),
    rows,
  };
}

async function getProviderParserHealthTs(provider?: ProviderId, limitPerProvider = 80) {
  const targets: ProviderId[] = provider ? [provider] : ["codex", "claude", "gemini", "copilot"];
  const scans = await Promise.all(targets.map((item) => getProviderSessionScan(item, limitPerProvider)));
  const reports: Array<Record<string, unknown>> = scans.map((scan) => {
    const parseOk = scan.rows.filter((row) => row.probe.ok).length;
    const parseFail = scan.rows.length - parseOk;
    const score = scan.rows.length ? Number(((parseOk / scan.rows.length) * 100).toFixed(1)) : null;
    return {
      provider: scan.provider,
      name: scan.name,
      status: scan.status,
      scanned: scan.rows.length,
      parse_ok: parseOk,
      parse_fail: parseFail,
      parse_score: score,
      truncated: scan.truncated,
      sample_errors: scan.rows
        .filter((row) => !row.probe.ok)
        .slice(0, 8)
        .map((row) => ({
          session_id: row.session_id,
          path: row.file_path,
          format: row.probe.format,
          error: row.probe.error,
        })),
    };
  });
  const totalScanned = reports.reduce((sum, row) => sum + parseNumber((row as Record<string, unknown>).scanned), 0);
  const totalFail = reports.reduce((sum, row) => sum + parseNumber((row as Record<string, unknown>).parse_fail), 0);
  const totalOk = reports.reduce((sum, row) => sum + parseNumber((row as Record<string, unknown>).parse_ok), 0);
  return {
    generated_at: nowIsoUtc(),
    summary: {
      providers: reports.length,
      scanned: totalScanned,
      parse_ok: totalOk,
      parse_fail: totalFail,
      parse_score: totalScanned ? Number(((totalOk / totalScanned) * 100).toFixed(1)) : null,
    },
    reports,
  };
}

async function getRoadmapStatusTs() {
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
    const status = Object.prototype.hasOwnProperty.call(statusCounts, raw) ? raw : "planned";
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

async function appendRoadmapCheckinTs(note: string, actor: string) {
  let overview: Record<string, unknown> = {};
  let runtime: Record<string, unknown> = {};
  let apps: Record<string, unknown> = {};

  try {
    const o = await requestPythonJson("/api/overview", "GET", { query: { include_threads: "0" }, timeoutMs: 14000 });
    if (isRecord(o.payload)) overview = o.payload;
  } catch {
    // no-op
  }
  try {
    const r = await requestPythonJson("/api/runtime-health", "GET", { timeoutMs: 8000 });
    if (isRecord(r.payload)) runtime = r.payload;
  } catch {
    // no-op
  }
  try {
    const a = await requestPythonJson("/api/compare-apps", "GET", { timeoutMs: 8000 });
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
  const lightweightHealthScore = Math.max(0, 100 - Math.min(75, highRisk * 4 + Math.floor(ctxHigh / 4) + Math.floor(orphan / 3)));

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
  await writeFile(ROADMAP_LOG_FILE, `${JSON.stringify(entry, null, 0)}\n`, { encoding: "utf-8", flag: "a" });
  return entry;
}

async function proxyToPython(req: ProxyRequest, reply: FastifyReply, pathname: string) {
  const method = req.method.toUpperCase();
  const url = buildProxyUrl(pathname, req.query as Record<string, string | string[] | undefined>);

  const headers: Record<string, string> = {
    accept: "application/json",
  };

  let body: string | undefined;
  if (method !== "GET" && method !== "HEAD") {
    body = JSON.stringify(req.body ?? {});
    headers["content-type"] = "application/json";
  }

  try {
    const proxied = await fetchWithTimeout(url, { method, headers, body }, 30000);
    const text = await proxied.text();
    const parsed = safeJsonParse(text);
    const normalized = withSchemaVersion(parsed ?? text);

    reply.code(proxied.status);
    return reply.send(normalized);
  } catch (error) {
    return reply.code(502).send(envelope(null, `python-backend-unreachable: ${String(error)}`));
  }
}

async function runBulkAction(action: BulkThreadAction, threadId: string) {
  const endpointMap: Record<BulkThreadAction, { path: string; body: Record<string, unknown> }> = {
    pin: {
      path: "/api/thread-pin",
      body: { ids: [threadId], pinned: true },
    },
    unpin: {
      path: "/api/thread-pin",
      body: { ids: [threadId], pinned: false },
    },
    archive_local: {
      path: "/api/thread-archive-local",
      body: { ids: [threadId] },
    },
    resume_command: {
      path: "/api/thread-resume-command",
      body: { ids: [threadId] },
    },
  };

  const target = endpointMap[action];

  try {
    const res = await fetchWithTimeout(`${PYTHON_BACKEND_URL}${target.path}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(target.body),
    }, 12000);

    const text = await res.text();
    const parsed = safeJsonParse(text);
    const payloadOk = isRecord(parsed) && Object.prototype.hasOwnProperty.call(parsed, "ok") ? Boolean(parsed.ok) : true;

    return {
      thread_id: threadId,
      ok: res.ok && payloadOk,
      status: res.status,
      error: res.ok && payloadOk ? null : `status-${res.status}`,
      data: parsed,
    };
  } catch (error) {
    return {
      thread_id: threadId,
      ok: false,
      status: 0,
      error: String(error),
    };
  }
}

export async function createServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  app.get("/api/healthz", async () => {
    return envelope({
      service: "api-ts",
      status: "ok",
      mode: "hybrid",
      python_backend_url: PYTHON_BACKEND_URL,
      uptime_sec: Math.round((Date.now() - START_TS) / 1000),
    });
  });

  app.get("/api/version", async () => {
    return envelope({
      app_version: APP_VERSION,
      schema_version: SCHEMA_VERSION,
      node: process.version,
      runtime: "fastify",
      desktop: "tauri",
      migration_mode: "incremental-ts",
    });
  });

  app.get("/api/agent-runtime", async () => {
    const runtime = await getAgentRuntimeState();
    return envelope(runtime);
  });

  app.post<{ Body: BulkThreadActionRequest }>("/api/bulk-thread-action", async (req, reply) => {
    const parsed = bulkRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }

    const { action, thread_ids: threadIds } = parsed.data;
    const results = await Promise.all(threadIds.map((threadId) => runBulkAction(action, threadId)));
    const success = results.filter((r) => r.ok).length;

    const payload: BulkThreadActionResult = {
      action,
      total: threadIds.length,
      success,
      failed: threadIds.length - success,
      results,
    };

    return envelope(payload, null);
  });

  app.get("/api/roadmap-status", async (_req, reply) => {
    try {
      const data = await getRoadmapStatusTs();
      return reply.code(200).send(withSchemaVersion(data));
    } catch (error) {
      return reply.code(500).send(envelope(null, `roadmap-status-error: ${String(error)}`));
    }
  });

  app.post<{ Body: { note?: string; actor?: string } }>("/api/roadmap-checkin", async (req, reply) => {
    try {
      const note = cleanTitleText(String(req.body?.note ?? ""), 280);
      const actor = cleanTitleText(String(req.body?.actor ?? "codex"), 32);
      const entry = await appendRoadmapCheckinTs(note, actor);
      const status = await getRoadmapStatusTs();
      return reply.code(200).send(
        withSchemaVersion({
          ok: true,
          entry,
          status,
        }),
      );
    } catch (error) {
      return reply.code(500).send(envelope(null, `roadmap-checkin-error: ${String(error)}`));
    }
  });

  app.get<{ Querystring: QueryMap }>("/api/threads", async (req, reply) => {
    try {
      const proxied = await getCachedThreads(req.query);
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply.code(502).send(envelope(null, `python-backend-unreachable: ${String(error)}`));
    }
  });

  const idsPayloadSchema = z.object({
    ids: z.array(z.string().min(1)).min(1).max(500),
  });

  const pinPayloadSchema = z.object({
    ids: z.array(z.string().min(1)).min(1).max(500),
    pinned: z.boolean().optional().default(true),
  });

  app.post<{ Body: unknown }>("/api/thread-pin", async (req, reply) => {
    const parsed = pinPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const proxied = await requestPythonJson("/api/thread-pin", "POST", { body: parsed.data });
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply.code(502).send(envelope(null, `python-backend-unreachable: ${String(error)}`));
    }
  });

  app.post<{ Body: unknown }>("/api/thread-archive-local", async (req, reply) => {
    const parsed = idsPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const proxied = await requestPythonJson("/api/thread-archive-local", "POST", { body: parsed.data });
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply.code(502).send(envelope(null, `python-backend-unreachable: ${String(error)}`));
    }
  });

  app.post<{ Body: unknown }>("/api/thread-resume-command", async (req, reply) => {
    const parsed = idsPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const proxied = await requestPythonJson("/api/thread-resume-command", "POST", { body: parsed.data });
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply.code(502).send(envelope(null, `python-backend-unreachable: ${String(error)}`));
    }
  });

  app.post<{ Body: unknown }>("/api/analyze-delete", async (req, reply) => {
    const parsed = idsPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const proxied = await requestPythonJson("/api/analyze-delete", "POST", { body: parsed.data });
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply.code(502).send(envelope(null, `python-backend-unreachable: ${String(error)}`));
    }
  });

  const cleanupPayloadSchema = z
    .object({
      ids: z.array(z.string().min(1)).min(1).max(500),
      dry_run: z.boolean().optional().default(true),
      options: z.unknown().optional(),
      confirm_token: z.string().optional().default(""),
    })
    .transform((value) => ({
      ids: value.ids,
      dry_run: value.dry_run,
      options: isRecord(value.options) ? value.options : {},
      confirm_token: value.confirm_token,
    }));

  const providerSessionActionSchema = z.object({
    provider: z.enum(["codex", "claude", "gemini", "copilot"]),
    action: z.enum(["archive_local", "delete_local"]),
    file_paths: z.array(z.string().min(1)).min(1).max(500),
    dry_run: z.boolean().optional().default(true),
    confirm_token: z.string().optional().default(""),
  });

  app.post<{ Body: unknown }>("/api/local-cleanup", async (req, reply) => {
    const parsed = cleanupPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const proxied = await requestPythonJson("/api/local-cleanup", "POST", { body: parsed.data, timeoutMs: 30000 });
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply.code(502).send(envelope(null, `python-backend-unreachable: ${String(error)}`));
    }
  });

  app.post<{ Body: unknown }>("/api/provider-session-action", async (req, reply) => {
    const parsed = providerSessionActionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const result = await runProviderSessionAction(
        parsed.data.provider,
        parsed.data.action,
        parsed.data.file_paths,
        parsed.data.dry_run,
        parsed.data.confirm_token,
      );
      const status = result.ok ? 200 : 400;
      return reply.code(status).send(withSchemaVersion(result));
    } catch (error) {
      return reply.code(500).send(envelope(null, `provider-session-action-error: ${String(error)}`));
    }
  });

  app.get("/api/recovery-center", async (_req, reply) => {
    try {
      const data = await getRecoveryCenterDataTs();
      return reply.code(200).send(withSchemaVersion(data));
    } catch (error) {
      return reply.code(500).send(envelope(null, `recovery-center-error: ${String(error)}`));
    }
  });

  const recoveryChecklistSchema = z.object({
    item_id: z.string().min(1),
    done: z.boolean(),
  });

  app.post<{ Body: unknown }>("/api/recovery-checklist", async (req, reply) => {
    const parsed = recoveryChecklistSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const result = await updateRecoveryChecklistItem(parsed.data.item_id, parsed.data.done);
      if (!result.ok) {
        return reply.code(400).send(withSchemaVersion(result));
      }
      const data = await getRecoveryCenterDataTs();
      return reply.code(200).send(withSchemaVersion({ ok: true, data }));
    } catch (error) {
      return reply.code(500).send(envelope(null, `recovery-checklist-error: ${String(error)}`));
    }
  });

  app.post("/api/recovery-drill", async (_req, reply) => {
    try {
      const drill = await runRecoveryDrillTs();
      const status = drill.ok ? 200 : 400;
      const center = await getRecoveryCenterDataTs();
      const data = {
        ...center,
        drill: drill.drill,
      };
      return reply.code(status).send(
        withSchemaVersion({
          ok: Boolean(drill.ok),
          data,
          drill: drill.drill,
          error: drill.error ?? "",
        }),
      );
    } catch (error) {
      return reply.code(500).send(envelope(null, `recovery-drill-error: ${String(error)}`));
    }
  });

  app.get("/api/compare-apps", async (_req, reply) => {
    try {
      const data = await getCompareAppsStatusTs();
      return reply.code(200).send(withSchemaVersion(data));
    } catch (error) {
      return reply.code(500).send(envelope(null, `compare-apps-error: ${String(error)}`));
    }
  });

  app.get("/api/runtime-health", async (_req, reply) => {
    try {
      const data = await getRuntimeHealthTs();
      return reply.code(200).send(withSchemaVersion(data));
    } catch (error) {
      return reply.code(500).send(envelope(null, `runtime-health-error: ${String(error)}`));
    }
  });

  app.get("/api/data-sources", async (_req, reply) => {
    try {
      const data = await getDataSourceInventoryTs();
      return reply.code(200).send(withSchemaVersion(data));
    } catch (error) {
      return reply.code(500).send(envelope(null, `data-sources-error: ${String(error)}`));
    }
  });

  app.get("/api/provider-matrix", async (_req, reply) => {
    try {
      const data = await getProviderMatrixTs();
      return reply.code(200).send(withSchemaVersion(data));
    } catch (error) {
      return reply.code(500).send(envelope(null, `provider-matrix-error: ${String(error)}`));
    }
  });

  app.get<{ Querystring: QueryMap }>("/api/provider-sessions", async (req, reply) => {
    try {
      const providerRaw = Array.isArray(req.query.provider) ? req.query.provider[0] : req.query.provider;
      const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
      const provider = parseProviderId(providerRaw);
      if (providerRaw && !provider) {
        return reply.code(400).send(envelope(null, "invalid provider"));
      }
      const limit = Math.max(1, Math.min(240, Number(limitRaw) || 80));
      const data = await getProviderSessionsTs(provider, limit);
      return reply.code(200).send(withSchemaVersion(data));
    } catch (error) {
      return reply.code(500).send(envelope(null, `provider-sessions-error: ${String(error)}`));
    }
  });

  app.get<{ Querystring: QueryMap }>("/api/provider-parser-health", async (req, reply) => {
    try {
      const providerRaw = Array.isArray(req.query.provider) ? req.query.provider[0] : req.query.provider;
      const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
      const provider = parseProviderId(providerRaw);
      if (providerRaw && !provider) {
        return reply.code(400).send(envelope(null, "invalid provider"));
      }
      const limit = Math.max(1, Math.min(120, Number(limitRaw) || 80));
      const data = await getProviderParserHealthTs(provider, limit);
      return reply.code(200).send(withSchemaVersion(data));
    } catch (error) {
      return reply.code(500).send(envelope(null, `provider-parser-health-error: ${String(error)}`));
    }
  });

  app.get("/api/agent-loops", async (_req, reply) => {
    try {
      const proxied = await requestPythonJson("/api/agent-loops", "GET", { timeoutMs: 15000 });
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply.code(502).send(envelope(null, `python-backend-unreachable: ${String(error)}`));
    }
  });

  app.get<{ Querystring: QueryMap }>("/api/alert-hooks", async (req, reply) => {
    try {
      const proxied = await requestPythonJson("/api/alert-hooks", "GET", {
        query: req.query,
        timeoutMs: 20000,
      });
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply.code(502).send(envelope(null, `python-backend-unreachable: ${String(error)}`));
    }
  });

  const alertConfigSchema = z.object({
    desktop_notify: z.boolean(),
  });

  app.post<{ Body: unknown }>("/api/alert-hooks/config", async (req, reply) => {
    const parsed = alertConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const proxied = await requestPythonJson("/api/alert-hooks/config", "POST", {
        body: parsed.data,
        timeoutMs: 20000,
      });
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply.code(502).send(envelope(null, `python-backend-unreachable: ${String(error)}`));
    }
  });

  const alertRuleSchema = z.object({
    rule_id: z.string().min(1),
    enabled: z.boolean().optional(),
    threshold: z.number().optional(),
    cooldown_min: z.number().int().positive().optional(),
  });

  app.post<{ Body: unknown }>("/api/alert-hooks/rule", async (req, reply) => {
    const parsed = alertRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const proxied = await requestPythonJson("/api/alert-hooks/rule", "POST", {
        body: parsed.data,
        timeoutMs: 20000,
      });
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply.code(502).send(envelope(null, `python-backend-unreachable: ${String(error)}`));
    }
  });

  const alertEvaluateSchema = z.object({
    force_refresh: z.boolean().optional().default(false),
  });

  app.post<{ Body: unknown }>("/api/alert-hooks/evaluate", async (req, reply) => {
    const parsed = alertEvaluateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const proxied = await requestPythonJson("/api/alert-hooks/evaluate", "POST", {
        body: parsed.data,
        timeoutMs: 25000,
      });
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply.code(502).send(envelope(null, `python-backend-unreachable: ${String(error)}`));
    }
  });

  app.get<{ Querystring: QueryMap }>("/api/overview", async (req, reply) => {
    try {
      const proxied = await requestPythonJson("/api/overview", "GET", {
        query: req.query,
        timeoutMs: 40000,
      });
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply.code(502).send(envelope(null, `python-backend-unreachable: ${String(error)}`));
    }
  });

  app.get<{ Querystring: QueryMap }>("/api/codex-observatory", async (req, reply) => {
    try {
      const proxied = await requestPythonJson("/api/codex-observatory", "GET", {
        query: req.query,
        timeoutMs: 30000,
      });
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply.code(502).send(envelope(null, `python-backend-unreachable: ${String(error)}`));
    }
  });

  const renameThreadSchema = z.object({
    id: z.string().min(1),
    title: z.string().min(1),
  });

  app.post<{ Body: unknown }>("/api/rename-thread", async (req, reply) => {
    const parsed = renameThreadSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const proxied = await requestPythonJson("/api/rename-thread", "POST", { body: parsed.data, timeoutMs: 15000 });
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply.code(502).send(envelope(null, `python-backend-unreachable: ${String(error)}`));
    }
  });

  const threadForensicsSchema = z.object({
    ids: z.array(z.string().min(1)).optional(),
    thread_ids: z.array(z.string().min(1)).optional(),
  });

  app.post<{ Body: unknown }>("/api/thread-forensics", async (req, reply) => {
    const parsed = threadForensicsSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    const ids = parsed.data.ids ?? parsed.data.thread_ids ?? [];
    try {
      const proxied = await requestPythonJson("/api/thread-forensics", "POST", {
        body: { ids },
        timeoutMs: 20000,
      });
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply.code(502).send(envelope(null, `python-backend-unreachable: ${String(error)}`));
    }
  });

  const agentLoopActionSchema = z.object({
    loop_id: z.string().min(1),
    action: z.enum(["start", "stop", "restart", "run2", "status", "watch-start", "watch-stop", "watch-status"]),
  });

  app.post<{ Body: unknown }>("/api/agent-loops/action", async (req, reply) => {
    const parsed = agentLoopActionSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(envelope(null, parsed.error.message));
    }
    try {
      const proxied = await requestPythonJson("/api/agent-loops/action", "POST", { body: parsed.data, timeoutMs: 20000 });
      return reply.code(proxied.status).send(proxied.payload);
    } catch (error) {
      return reply.code(502).send(envelope(null, `python-backend-unreachable: ${String(error)}`));
    }
  });

  app.all("/api/*", async (req: ProxyRequest, reply) => {
    const wildcard = req.params["*"] || "";
    const pathname = `/api/${wildcard}`;

    if (directApiPaths.has(pathname)) {
      return reply.code(404).send(envelope(null, "direct-path-routing-conflict"));
    }

    if (!proxiedApiPaths.has(pathname)) {
      req.log.warn({ pathname }, "proxying unknown /api path to python backend");
    }

    return proxyToPython(req, reply, pathname);
  });

  app.setErrorHandler((error, _req, reply) => {
    const msg = error instanceof Error ? error.message : String(error);
    reply.code(500).send(envelope(null, msg));
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createServer()
    .then((app) => app.listen({ host: "127.0.0.1", port: DEFAULT_PORT }))
    .then(() => {
      // no-op
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
