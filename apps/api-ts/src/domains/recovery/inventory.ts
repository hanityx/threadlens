import path from "node:path";

import {
  CHAT_DIR,
  CLAUDE_HOME,
  CLAUDE_PROJECTS_DIR,
  CODEX_HOME,
  COPILOT_CURSOR_GLOBAL,
  COPILOT_VSCODE_GLOBAL,
  GEMINI_HOME,
  GEMINI_TMP_DIR,
} from "../../lib/constants.js";
import {
  nowIsoUtc,
  pathExists,
  scanPathStatsTs,
} from "../../lib/utils.js";

const DATA_SOURCE_CACHE_TTL_MS = 60_000;
let dataSourceInventoryCache: { expires_at: number; data: Record<string, unknown> } | null = null;
let dataSourceInventoryInflight: Promise<Record<string, unknown>> | null = null;

async function buildDataSourceInventoryTs() {
  const historyPath = path.join(CODEX_HOME, "history.jsonl");
  const globalStatePath = path.join(CODEX_HOME, ".codex-global-state.json");

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

export async function getDataSourceInventoryTs(options?: { forceRefresh?: boolean }) {
  const forceRefresh = Boolean(options?.forceRefresh);
  const now = Date.now();
  if (!forceRefresh && dataSourceInventoryCache && dataSourceInventoryCache.expires_at > now) {
    return dataSourceInventoryCache.data;
  }
  if (dataSourceInventoryInflight) return dataSourceInventoryInflight;

  dataSourceInventoryInflight = buildDataSourceInventoryTs()
    .then((data) => {
      dataSourceInventoryCache = {
        expires_at: Date.now() + DATA_SOURCE_CACHE_TTL_MS,
        data,
      };
      return data;
    })
    .finally(() => {
      dataSourceInventoryInflight = null;
    });
  return dataSourceInventoryInflight;
}
