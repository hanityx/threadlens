/**
 * Shared path constants and configuration values.
 *
 * Keep this file limited to platform and API/runtime configuration.
 * Provider and recovery roots live under their domain constants modules.
 */

import path from "node:path";
import {
  APP_DATA_DIR,
  APP_VERSION,
  DEFAULT_PORT,
  DOCUMENTS_DIR,
  DOWNLOADS_DIR,
  HOME_DIR,
  PROJECTS_DIR,
  PROJECT_ROOT,
  START_TS,
  STATE_DIR,
  resolveAppVersion,
  resolvePlatformAppDataDir,
  resolvePlatformChatDir,
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
  PROJECTS_DIR,
  PROJECT_ROOT,
  START_TS,
  STATE_DIR,
  resolveAppVersion,
  resolvePlatformAppDataDir,
  resolvePlatformChatDir,
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

export const THREADS_BOOT_CACHE_FILE = path.join(
  PROJECT_ROOT,
  ".run",
  "threads_boot_cache.json",
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
