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

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
// lib/ → src/ → api-ts/ → apps/ → project root
export const PROJECT_ROOT = path.resolve(THIS_DIR, "../../../..");

/* ── Server config ────────────────────────────────────────────────── */

export const DEFAULT_PORT = Number(process.env.API_TS_PORT ?? 8788);
export const PYTHON_BACKEND_URL =
  process.env.PYTHON_BACKEND_URL ?? "http://127.0.0.1:8787";
export const APP_VERSION = process.env.APP_VERSION ?? "0.1.0";
export const START_TS = Date.now();

/* ── Project-level files ──────────────────────────────────────────── */

export const ROADMAP_STATE_FILE = path.join(PROJECT_ROOT, "roadmap_state.json");
export const ROADMAP_LOG_FILE = path.join(
  PROJECT_ROOT,
  "roadmap_checkins.jsonl",
);
export const RECOVERY_CHECKLIST_FILE = path.join(
  PROJECT_ROOT,
  "w4_checklist.json",
);
export const RECOVERY_PLAN_DIR = path.join(PROJECT_ROOT, "recovery_plans");

/* ── Codex paths ──────────────────────────────────────────────────── */

export const CODEX_HOME =
  process.env.CODEX_HOME ?? path.join(process.env.HOME ?? "", ".codex");
export const BACKUP_ROOT = path.join(CODEX_HOME, "local_cleanup_backups");
export const THREADS_BOOT_CACHE_FILE = path.join(
  PROJECT_ROOT,
  ".run",
  "threads_boot_cache.json",
);

/* ── Provider storage roots ───────────────────────────────────────── */

export const HOME_DIR = process.env.HOME ?? "";
export const CHAT_DIR = path.join(
  HOME_DIR,
  "Library",
  "Application Support",
  "com.openai.chat",
);
export const CLAUDE_HOME = path.join(HOME_DIR, ".claude");
export const CLAUDE_PROJECTS_DIR = path.join(CLAUDE_HOME, "projects");
export const GEMINI_HOME = path.join(HOME_DIR, ".gemini");
export const GEMINI_TMP_DIR = path.join(GEMINI_HOME, "tmp");
export const COPILOT_VSCODE_GLOBAL = path.join(
  HOME_DIR,
  "Library",
  "Application Support",
  "Code",
  "User",
  "globalStorage",
  "github.copilot-chat",
);
export const COPILOT_CURSOR_GLOBAL = path.join(
  HOME_DIR,
  "Library",
  "Application Support",
  "Cursor",
  "User",
  "globalStorage",
  "github.copilot-chat",
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
  "/api/thread-transcript",
  "/api/session-transcript",
  "/api/execution-graph",
]);

export const proxiedApiPaths = new Set([
  "/api/threads",
  "/api/thread-pin",
  "/api/thread-archive-local",
  "/api/thread-resume-command",
  "/api/analyze-delete",
  "/api/local-cleanup",
]);
