import {
  GEMINI_ANTIGRAVITY_CONVERSATIONS_DIR,
  GEMINI_HISTORY_DIR,
  GEMINI_HOME,
  GEMINI_TMP_DIR,
} from "../../../../lib/constants.js";
import { countFilesRecursiveByExt, pathExists } from "../../../../lib/utils.js";
import type { ProviderHealthEvidence } from "../../types.js";

export async function getGeminiProviderHealth(): Promise<ProviderHealthEvidence> {
  const rootExists = await pathExists(GEMINI_HOME);
  const sessionLogCount =
    (await countFilesRecursiveByExt(GEMINI_TMP_DIR, [".jsonl", ".json"])) +
    (await countFilesRecursiveByExt(GEMINI_HISTORY_DIR, [".jsonl", ".json"])) +
    (await countFilesRecursiveByExt(GEMINI_ANTIGRAVITY_CONVERSATIONS_DIR, [".pb"]));

  return {
    root_exists: rootExists,
    session_log_count: sessionLogCount,
    roots: [
      GEMINI_HOME,
      GEMINI_TMP_DIR,
      GEMINI_HISTORY_DIR,
      GEMINI_ANTIGRAVITY_CONVERSATIONS_DIR,
    ],
    notes: "History, tmp, and checkpoint files.",
  };
}
