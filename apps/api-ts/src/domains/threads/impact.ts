import {
  CHAT_DIR,
} from "../../lib/constants.js";
import { resolveCodexSessionPathByThreadId } from "../providers/search.js";
import { loadCodexUiState } from "./state.js";
import {
  collectCodexLocalRefs,
  readCodexSessionMetaForThreadIdWithResolver,
} from "./metadata.js";

export type AnalyzeDeleteReportTs = {
  id: string;
  exists: boolean;
  title?: string;
  risk_level?: string;
  risk_score?: number;
  summary?: string;
  parents?: string[];
  impacts?: string[];
};

export type AnalyzeDeleteDataTs = {
  count: number;
  reports: AnalyzeDeleteReportTs[];
};

export async function analyzeDeleteImpactTs(
  threadIds: string[],
  options?: {
    stateFilePath?: string;
    chatDir?: string;
    resolveSessionPath?: (threadId: string) => Promise<string | null>;
  },
): Promise<AnalyzeDeleteDataTs> {
  const ids = Array.from(
    new Set(threadIds.map((item) => String(item || "").trim()).filter(Boolean)),
  );
  const state = await loadCodexUiState(options?.stateFilePath);
  const titles = state.titles;
  const orderSet = new Set(state.order);
  const pinnedSet = new Set(state.pinned);
  const { refs, bucketCounts } = await collectCodexLocalRefs(ids, options?.chatDir ?? CHAT_DIR);

  const reports: AnalyzeDeleteReportTs[] = [];
  for (const threadId of ids) {
    const sessionMeta = await readCodexSessionMetaForThreadIdWithResolver(
      threadId,
      options?.resolveSessionPath ?? resolveCodexSessionPathByThreadId,
    );
    const local = refs.get(threadId) ?? {
      has_local_data: false,
      project_buckets: new Set<string>(),
    };
    const hasState =
      Boolean(titles[threadId]) || orderSet.has(threadId) || pinnedSet.has(threadId);
    const exists = Boolean(hasState || local.has_local_data || sessionMeta.has_session_log);
    if (!exists) {
      reports.push({
        id: threadId,
        exists: false,
        risk_level: "unknown",
        risk_score: 0,
        summary: "Not found in the current index",
        parents: [],
        impacts: [],
      });
      continue;
    }

    const parents: string[] = [];
    const impacts: string[] = [];
    let score = 0;

    if (titles[threadId]) {
      parents.push("global-state:thread-titles");
      impacts.push("Removed from sidebar title metadata");
      score += 1;
    }
    if (pinnedSet.has(threadId)) {
      parents.push("global-state:pinned-thread-ids");
      impacts.push("Removed from the pinned list");
      score += 2;
    }
    if (orderSet.has(threadId)) {
      parents.push("global-state:thread-order");
      impacts.push("Removed from sidebar ordering");
      score += 1;
    }
    if (local.has_local_data) {
      parents.push("com.openai.chat:conversations-v3-*");
      impacts.push("Local conversation cache file (.data) will be removed");
      score += 1;
    }
    if (sessionMeta.has_session_log) {
      parents.push(".codex:sessions/archived_sessions");
      impacts.push("Session logs are stored separately and remain unless cleaned up separately");
      score += 1;
    }

    const projectBuckets = Array.from(local.project_buckets).sort();
    for (const bucket of projectBuckets) {
      parents.push(`project-bucket:${bucket}`);
      const count = Number(bucketCounts.get(bucket) ?? 0);
      if (count <= 1) {
        impacts.push(`${bucket} bucket may become empty`);
        score += 2;
      } else {
        impacts.push(`Thread count will decrease in bucket ${bucket}`);
        score += 1;
      }
    }

    if (sessionMeta.cwd) {
      parents.push(`workspace:${sessionMeta.cwd}`);
    }

    const risk_level = score >= 6 ? "high" : score >= 3 ? "medium" : "low";
    reports.push({
      id: threadId,
      exists: true,
      title: titles[threadId] || `thread ${threadId.slice(0, 8)}`,
      risk_level,
      risk_score: score,
      summary: impacts.join(" / ") || "Little to no impact",
      parents: Array.from(new Set(parents)).sort(),
      impacts,
    });
  }

  return {
    count: ids.length,
    reports,
  };
}
