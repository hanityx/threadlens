import { CLAUDE_PROJECTS_DIR } from "../../../../lib/constants.js";
import { isRecord, readFileTail, safeJsonParse } from "../../../../lib/utils.js";
import { isPathInsideRoot } from "../../path-safety.js";
import { normalizeDetectedTitle } from "../../title-normalization.js";

export async function detectClaudeRenamedTitle(
  filePath: string,
  format: "jsonl" | "json" | "unknown",
): Promise<{ title: string; source: string | null } | null> {
  if (
    format !== "jsonl" ||
    !isPathInsideRoot(filePath, CLAUDE_PROJECTS_DIR)
  ) {
    return null;
  }
  const tail = await readFileTail(filePath, 262_144);
  if (!tail.text.trim()) return null;
  let customTitle = "";
  let agentName = "";
  for (const line of tail.text.split(/\r?\n/)) {
    const parsed = safeJsonParse(line);
    if (!isRecord(parsed)) continue;
    const type = String(parsed.type ?? "");
    if (type === "custom-title") {
      const value = normalizeDetectedTitle(String(parsed.customTitle ?? ""));
      if (value) customTitle = value;
      continue;
    }
    if (type === "agent-name") {
      const value = normalizeDetectedTitle(String(parsed.agentName ?? ""));
      if (value) agentName = value;
    }
  }
  if (customTitle) {
    return { title: customTitle, source: "claude-custom-title" };
  }
  if (agentName) {
    return { title: agentName, source: "claude-agent-name" };
  }
  return null;
}
