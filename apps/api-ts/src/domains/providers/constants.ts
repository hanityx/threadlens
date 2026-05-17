import path from "node:path";
import {
  APP_DATA_DIR,
  HOME_DIR,
  PROJECTS_DIR,
  resolvePlatformAppDataDir,
  resolvePlatformChatDir,
  resolvePlatformHomeDir,
} from "../../platform/paths.js";

export {
  APP_DATA_DIR,
  HOME_DIR,
  PROJECTS_DIR,
  resolvePlatformAppDataDir,
  resolvePlatformChatDir,
  resolvePlatformHomeDir,
};

export const CHAT_DIR = resolvePlatformChatDir();

export const CODEX_HOME =
  process.env.CODEX_HOME ?? path.join(HOME_DIR, ".codex");
export const CODEX_GLOBAL_STATE_FILE = path.join(
  CODEX_HOME,
  ".codex-global-state.json",
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
