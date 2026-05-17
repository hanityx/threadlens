import path from "node:path";
import {
  CODEX_HOME,
  CLAUDE_HOME,
  CLAUDE_PROJECTS_DIR,
  CLAUDE_TRANSCRIPTS_DIR,
  COPILOT_CURSOR_GLOBAL,
  COPILOT_CURSOR_WORKSPACE_STORAGE,
  COPILOT_VSCODE_GLOBAL,
  COPILOT_VSCODE_WORKSPACE_STORAGE,
} from "../../constants.js";
import {
  countFilesRecursiveByExt,
  countJsonlFilesRecursive,
  pathExists,
} from "../../../../lib/utils.js";
import {
  providerHealth,
  providerRoots,
} from "./adapter-access.js";
import {
  countCopilotMatrixSessionFiles,
} from "./copilot.js";
import { codexTranscriptSearchRoots } from "../../path-safety.js";
import type {
  ProviderRootSpec,
} from "../../types.js";

export type ProviderMatrixSignals = {
  codexHomes: string[];
  codexRootExists: boolean;
  claudeRootExists: boolean;
  geminiRootExists: boolean;
  geminiSessionLogs: number;
  geminiRoots: string[];
  geminiNotes: string;
  copilotProviderRoots: ProviderRootSpec[];
  copilotRootExists: boolean;
  codexSessionLogs: number;
  claudeSessionLogs: number;
  copilotSignalFiles: number;
};

export async function readProviderMatrixSignals(): Promise<ProviderMatrixSignals> {
  const codexHomes = Array.from(
    new Set(codexTranscriptSearchRoots().map((spec) => path.dirname(spec.root))),
  );
  const codexRootExists = await pathExists(CODEX_HOME);
  const claudeRootExists = await pathExists(CLAUDE_HOME);
  const copilotVsCodeExists = await pathExists(COPILOT_VSCODE_GLOBAL);
  const copilotCursorExists = await pathExists(COPILOT_CURSOR_GLOBAL);
  const copilotVsCodeWorkspaceExists = await pathExists(
    COPILOT_VSCODE_WORKSPACE_STORAGE,
  );
  const copilotCursorWorkspaceExists = await pathExists(
    COPILOT_CURSOR_WORKSPACE_STORAGE,
  );
  const geminiHealth = await providerHealth("gemini");
  const copilotProviderRoots = providerRoots("copilot");

  const codexSessionLogs =
    (await countJsonlFilesRecursive(path.join(CODEX_HOME, "sessions"))) +
    (await countJsonlFilesRecursive(path.join(CODEX_HOME, "archived_sessions")));
  const claudeSessionLogs =
    (await countFilesRecursiveByExt(CLAUDE_PROJECTS_DIR, [".jsonl", ".json"])) +
    (await countFilesRecursiveByExt(CLAUDE_TRANSCRIPTS_DIR, [".jsonl", ".json"]));
  const geminiRootExists = geminiHealth?.root_exists ?? false;
  const geminiSessionLogs = geminiHealth?.session_log_count ?? 0;
  const copilotSignalFiles = await countCopilotMatrixSessionFiles(copilotProviderRoots);

  return {
    codexHomes,
    codexRootExists,
    claudeRootExists,
    geminiRootExists,
    geminiSessionLogs,
    geminiRoots: geminiHealth?.roots ?? [],
    geminiNotes: geminiHealth?.notes ?? "History, tmp, and checkpoint files.",
    copilotProviderRoots,
    copilotRootExists:
      copilotVsCodeExists ||
      copilotCursorExists ||
      copilotVsCodeWorkspaceExists ||
      copilotCursorWorkspaceExists,
    codexSessionLogs,
    claudeSessionLogs,
    copilotSignalFiles,
  };
}
