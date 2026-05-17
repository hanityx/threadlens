/**
 * Shared path constants and configuration values.
 *
 * Every other `lib/` module in this package imports from here.
 * The file must **not** import from any sibling module to keep the
 * dependency graph acyclic.
 */

import path from "node:path";
import {
  APP_DATA_DIR,
  APP_VERSION,
  DEFAULT_PORT,
  DOCUMENTS_DIR,
  DOWNLOADS_DIR,
  HOME_DIR,
  PROJECT_ROOT,
  START_TS,
  STATE_DIR,
  resolveAppVersion,
  resolvePlatformAppDataDir,
  resolvePlatformDocumentsDir,
  resolvePlatformDownloadsDir,
  resolvePlatformHomeDir,
} from "../platform/paths.js";

export {
  APP_DATA_DIR,
  APP_VERSION,
  DEFAULT_PORT,
  DOCUMENTS_DIR,
  DOWNLOADS_DIR,
  HOME_DIR,
  PROJECT_ROOT,
  START_TS,
  STATE_DIR,
  resolveAppVersion,
  resolvePlatformAppDataDir,
  resolvePlatformDocumentsDir,
  resolvePlatformDownloadsDir,
  resolvePlatformHomeDir,
};

export const THREADLENS_RELEASE_REPO = String(
  process.env.THREADLENS_RELEASE_REPO ?? "hanityx/threadlens",
).trim();
export const THREADLENS_RELEASES_URL = `https://github.com/${THREADLENS_RELEASE_REPO}/releases`;
export const THREADLENS_LATEST_RELEASE_URL = `${THREADLENS_RELEASES_URL}/latest`;
export const THREADLENS_GITHUB_RELEASE_API_URL =
  `https://api.github.com/repos/${THREADLENS_RELEASE_REPO}/releases/latest`;

/* ── Project-level files ──────────────────────────────────────────── */
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
export const UPDATE_CHECK_CACHE_FILE = path.join(STATE_DIR, "update_check.json");

/* ── Provider storage roots ───────────────────────────────────────── */
export const PROJECTS_DIR = String(
  process.env.THREADLENS_PROJECTS_DIR ?? process.env.PROJECTS_DIR ?? "",
).trim();

export function resolvePlatformChatDir(
  platform = process.platform,
  env: Record<string, string | undefined> = process.env,
) {
  if (platform === "darwin") {
    return path.join(
      resolvePlatformHomeDir(platform, env),
      "Library",
      "Application Support",
      "com.openai.chat",
    );
  }
  return path.join(resolvePlatformAppDataDir(platform, env), "com.openai.chat");
}

/* ── Codex paths ──────────────────────────────────────────────────── */

export const CODEX_HOME =
  process.env.CODEX_HOME ?? path.join(HOME_DIR, ".codex");
export const CODEX_GLOBAL_STATE_FILE = path.join(
  CODEX_HOME,
  ".codex-global-state.json",
);
export const BACKUP_ROOT = path.join(DOCUMENTS_DIR, "ThreadLens", "backups");
export const RECOVERY_EXPORT_ROOT = path.join(
  DOWNLOADS_DIR,
  "ThreadLens",
  "recovery-exports",
);
export const THREADS_BOOT_CACHE_FILE = path.join(
  PROJECT_ROOT,
  ".run",
  "threads_boot_cache.json",
);

export const CHAT_DIR = resolvePlatformChatDir();
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
  "/api/update-check",
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
  "/api/local-cleanup-backups",
  "/api/recovery-center",
  "/api/recovery-drill",
  "/api/recovery-checklist",
  "/api/related-tools",
  "/api/compare-apps",
  "/api/runtime-health",
  "/api/smoke-status",
  "/api/data-sources",
  "/api/provider-matrix",
  "/api/provider-sessions",
  "/api/provider-parser-health",
  "/api/provider-session-action",
  "/api/provider-open-folder",
  "/api/conversation-search",
  "/api/conversation-search/session-hits",
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
  "/api/thread-open-folder",
  "/api/thread-transcript",
  "/api/session-transcript",
  "/api/execution-graph",
]);

export const proxiedApiPaths = new Set<string>([]);
