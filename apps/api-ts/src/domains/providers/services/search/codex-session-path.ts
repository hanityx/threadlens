import path from "node:path";

import {
  codexTranscriptSearchRoots,
} from "../../path-safety.js";
import {
  walkFilesByExt,
} from "../../../../lib/utils.js";
import {
  getProviderSessionScan,
} from "./provider-session-scan.js";

export async function resolveCodexSessionPathByThreadId(
  threadId: string,
): Promise<string | null> {
  const normalized = String(threadId || "").trim();
  if (!normalized) return null;

  const recent = await getProviderSessionScan("codex", 240);
  const inRecent = recent.rows.find((row) => row.session_id === normalized);
  if (inRecent) return inRecent.file_path;

  const roots = codexTranscriptSearchRoots();
  for (const spec of roots) {
    const files = await walkFilesByExt(spec.root, spec.exts, 8000);
    const hit = files.find((file) => path.basename(file).includes(normalized));
    if (hit) return hit;
  }
  return null;
}
