/**
 * Shared path constants and configuration values.
 *
 * Every other `lib/` module in this package imports from here.
 * The file must **not** import from any sibling module to keep the
 * dependency graph acyclic.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

/* ── Build-time paths ─────────────────────────────────────────────── */

const THIS_DIR = process.env.THREADLENS_PROJECT_ROOT
  ? path.join(process.env.THREADLENS_PROJECT_ROOT, ".api-root")
  : path.dirname(fileURLToPath(import.meta.url));
// lib/ → src/ → api-ts/ → apps/ → project root
export const PROJECT_ROOT =
  process.env.THREADLENS_PROJECT_ROOT ??
  path.resolve(THIS_DIR, "../../../..");

/* ── Server config ────────────────────────────────────────────────── */

export const DEFAULT_PORT = Number(process.env.API_TS_PORT ?? 8788);
export const APP_VERSION = process.env.APP_VERSION ?? "0.1.0";
export const START_TS = Date.now();

const STATE_DIR_OVERRIDE = String(
  process.env.THREADLENS_STATE_DIR ?? "",
).trim();

/* ── Project-level files ──────────────────────────────────────────── */

export const STATE_DIR = path.resolve(
  PROJECT_ROOT,
  STATE_DIR_OVERRIDE || path.join(".run", "state"),
);
export const ROADMAP_STATE_FILE = path.join(STATE_DIR, "roadmap_state.json");
export const ROADMAP_LOG_FILE = path.join(
  STATE_DIR,
  "roadmap_checkins.jsonl",
);
export const RECOVERY_CHECKLIST_FILE = path.join(
  STATE_DIR,
  "w4_checklist.json",
);
export const RECOVERY_PLAN_DIR = path.join(STATE_DIR, "recovery_plans");
export const ALERT_RULES_FILE = path.join(STATE_DIR, "alert_rules.json");
export const ALERT_STATE_FILE = path.join(STATE_DIR, "alert_state.json");
export const ALERT_EVENTS_FILE = path.join(STATE_DIR, "alert_events.jsonl");

/* ── Codex paths ──────────────────────────────────────────────────── */

export const CODEX_HOME =
  process.env.CODEX_HOME ?? path.join(process.env.HOME ?? "", ".codex");
export const CODEX_GLOBAL_STATE_FILE = path.join(
  CODEX_HOME,
  ".codex-global-state.json",
);
export const BACKUP_ROOT = path.join(CODEX_HOME, "local_cleanup_backups");
export const THREADS_BOOT_CACHE_FILE = path.join(
  PROJECT_ROOT,
  ".run",
  "threads_boot_cache.json",
);

/* ── Provider storage roots ───────────────────────────────────────── */

export const HOME_DIR = process.env.HOME ?? "";
export const PROJECTS_DIR = String(
  process.env.THREADLENS_PROJECTS_DIR ?? process.env.PROJECTS_DIR ?? "",
).trim();

export function resolvePlatformAppDataDir(
  platform = process.platform,
  env: Record<string, string | undefined> = process.env,
) {
  const homeDir = env.HOME ?? "";
  if (platform === "darwin") {
    return path.join(homeDir, "Library", "Application Support");
  }
  if (platform === "win32") {
    return env.APPDATA ?? path.join(homeDir, "AppData", "Roaming");
  }
  return env.XDG_CONFIG_HOME ?? path.join(homeDir, ".config");
}

export const APP_DATA_DIR = resolvePlatformAppDataDir();
export const CHAT_DIR = path.join(
  HOME_DIR,
  "Library",
  "Application Support",
  "com.openai.chat",
);
export const CLAUDE_HOME = path.join(HOME_DIR, ".claude");
export const CLAUDE_PROJECTS_DIR = path.join(CLAUDE_HOME, "projects");
export const CLAUDE_TRANSCRIPTS_DIR = path.join(CLAUDE_HOME, "transcripts");
export const GEMINI_HOME = path.join(HOME_DIR, ".gemini");
export const GEMINI_HISTORY_DIR = path.join(GEMINI_HOME, "history");
export const GEMINI_TMP_DIR = path.join(GEMINI_HOME, "tmp");
export const GEMINI_ANTIGRAVITY_CONVERSATIONS_DIR = path.join(
  GEMINI_HOME,
  "antigravity",
  "conversations",
);
export const COPILOT_VSCODE_GLOBAL = path.join(
  APP_DATA_DIR,
  "Code",
  "User",
  "globalStorage",
  "github.copilot-chat",
);
export const COPILOT_VSCODE_WORKSPACE_STORAGE = path.join(
  APP_DATA_DIR,
  "Code",
  "User",
  "workspaceStorage",
);
export const COPILOT_CURSOR_GLOBAL = path.join(
  APP_DATA_DIR,
  "Cursor",
  "User",
  "globalStorage",
  "github.copilot-chat",
);
export const COPILOT_CURSOR_WORKSPACE_STORAGE = path.join(
  APP_DATA_DIR,
  "Cursor",
  "User",
  "workspaceStorage",
);

/* ── API path sets ────────────────────────────────────────────────── */

export const directApiPaths = new Set([
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
  "/api/related-tools",
  "/api/compare-apps",
  "/api/runtime-health",
  "/api/sync-lens",
  "/api/smoke-status",
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
  "/api/thread-transcript",
  "/api/session-transcript",
  "/api/execution-graph",
]);

export const proxiedApiPaths = new Set<string>([]);
