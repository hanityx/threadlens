import path from "node:path";
import {
  DOCUMENTS_DIR,
  DOWNLOADS_DIR,
  PROJECT_ROOT,
  STATE_DIR,
  START_TS,
} from "../../platform/paths.js";
import {
  CHAT_DIR,
  CODEX_HOME,
} from "../providers/constants.js";

export {
  CHAT_DIR,
  CODEX_HOME,
  PROJECT_ROOT,
  START_TS,
};

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

export const BACKUP_ROOT = path.join(DOCUMENTS_DIR, "ThreadLens", "backups");
export const RECOVERY_EXPORT_ROOT = path.join(
  DOWNLOADS_DIR,
  "ThreadLens",
  "recovery-exports",
);
