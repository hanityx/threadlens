import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import {
  CHAT_DIR,
} from "../../lib/constants.js";
import {
  getProviderSessionsTs,
  resolveCodexSessionPathByThreadId,
} from "../providers/search.js";
import { loadCodexUiState } from "./state.js";
import {
  collectCodexLocalRefs,
  readCodexSessionMetaForThreadIdWithResolver,
} from "./metadata.js";

type CrossSessionRowTs = {
  session_id: string;
  display_title?: string;
  file_path: string;
};

export type AnalyzeDeleteCrossSessionSampleTs = {
  thread_id: string;
  title?: string;
  direction: "outbound" | "inbound" | "both";
  strength: "strong" | "mention";
  evidence_kind:
    | "parent_thread_id"
    | "forked_from_id"
    | "new_thread_id"
    | "command_output"
    | "tool_output"
    | "search_text"
    | "copied_context"
    | "generic_mention";
  matched_field?: string;
  matched_event?: string;
  matched_value?: string;
  matched_excerpt?: string;
};

export type AnalyzeDeleteCrossSessionLinksTs = {
  strong_links: number;
  mention_links: number;
  related_threads: number;
  strong_samples: AnalyzeDeleteCrossSessionSampleTs[];
  mention_samples: AnalyzeDeleteCrossSessionSampleTs[];
  related_samples: AnalyzeDeleteCrossSessionSampleTs[];
};

export type AnalyzeDeleteReportTs = {
  id: string;
  exists: boolean;
  title?: string;
  risk_level?: string;
  risk_score?: number;
  summary?: string;
  parents?: string[];
  impacts?: string[];
  cross_session_links?: AnalyzeDeleteCrossSessionLinksTs;
};

export type AnalyzeDeleteDataTs = {
  count: number;
  reports: AnalyzeDeleteReportTs[];
  session_scan_limit?: number;
  session_scan_candidates?: number;
};

function emptyCrossSessionLinks(): AnalyzeDeleteCrossSessionLinksTs {
  return {
    strong_links: 0,
    mention_links: 0,
    related_threads: 0,
    strong_samples: [],
    mention_samples: [],
    related_samples: [],
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function findFilesContainingNeedleWithRg(
  filePaths: string[],
  needle: string,
): Promise<Set<string> | null> {
  const normalizedPaths = Array.from(new Set(filePaths.map((item) => String(item || "").trim()).filter(Boolean)));
  if (!normalizedPaths.length || !needle) return new Set<string>();
  return new Promise((resolve) => {
    let stdout = "";
    let settled = false;
    const finish = (value: Set<string> | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const child = spawn(
      "rg",
      ["--files-with-matches", "--fixed-strings", "--max-count", "1", "--no-messages", "--", needle, ...normalizedPaths],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk ?? "");
    });
    child.on("error", () => finish(null));
    child.on("close", (code) => {
      if (code !== 0 && code !== 1) {
        finish(null);
        return;
      }
      const matched = stdout
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter(Boolean);
      finish(new Set(matched));
    });
  });
}

function lineHasStrongLinkMarker(line: string): boolean {
  return (
    line.includes('"parent_thread_id"') ||
    line.includes('"forked_from_id"') ||
    line.includes('"new_thread_id"')
  );
}

type CrossSessionEvidenceTs = Pick<
  AnalyzeDeleteCrossSessionSampleTs,
  "strength" | "evidence_kind" | "matched_field" | "matched_event" | "matched_value" | "matched_excerpt"
>;

function buildMatchedExcerpt(line: string, needle: string): string {
  const normalized = line.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const idx = normalized.indexOf(needle);
  if (idx === -1) return normalized.slice(0, 120);
  const start = Math.max(0, idx - 60);
  const end = Math.min(normalized.length, idx + needle.length + 60);
  const excerpt = normalized.slice(start, end);
  return (start > 0 ? "…" : "") + excerpt + (end < normalized.length ? "…" : "");
}

function safeParseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function readPathValue(record: Record<string, unknown> | null, path: string): unknown {
  if (!record || !path) return undefined;
  return path.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object" || !(part in current)) return undefined;
    return (current as Record<string, unknown>)[part];
  }, record);
}

function stringifyMatchedValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => String(item)).join(" ");
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }
  if (value === undefined || value === null) return undefined;
  return String(value);
}

function firstMatchedRecordField(
  record: Record<string, unknown> | null,
  fieldPaths: string[],
): { field: string; value: unknown } | null {
  for (const fieldPath of fieldPaths) {
    const value = readPathValue(record, fieldPath);
    if (value !== undefined) {
      return { field: fieldPath, value };
    }
  }
  return null;
}

function classifyLineEvidence(line: string, needle: string): CrossSessionEvidenceTs {
  const record = safeParseJsonLine(line);
  const eventType = typeof record?.type === "string" ? record.type : undefined;
  const parentField = firstMatchedRecordField(record, [
    "payload.source.subagent.thread_spawn.parent_thread_id",
  ]);
  if (parentField || line.includes('"parent_thread_id"')) {
    const matchedField = parentField?.field ?? "payload.source.subagent.thread_spawn.parent_thread_id";
    return {
      strength: "strong",
      evidence_kind: "parent_thread_id",
      matched_field: matchedField,
      matched_event: eventType,
      matched_value: stringifyMatchedValue(parentField?.value ?? readPathValue(record, matchedField)),
      matched_excerpt: buildMatchedExcerpt(line, needle),
    };
  }
  const forkField = firstMatchedRecordField(record, ["payload.forked_from_id"]);
  if (forkField || line.includes('"forked_from_id"')) {
    const matchedField = forkField?.field ?? "payload.forked_from_id";
    return {
      strength: "strong",
      evidence_kind: "forked_from_id",
      matched_field: matchedField,
      matched_event: eventType,
      matched_value: stringifyMatchedValue(forkField?.value ?? readPathValue(record, matchedField)),
      matched_excerpt: buildMatchedExcerpt(line, needle),
    };
  }
  const newThreadField = firstMatchedRecordField(record, ["payload.new_thread_id"]);
  if (newThreadField || line.includes('"new_thread_id"')) {
    const matchedField = newThreadField?.field ?? "payload.new_thread_id";
    return {
      strength: "strong",
      evidence_kind: "new_thread_id",
      matched_field: matchedField,
      matched_event: eventType,
      matched_value: stringifyMatchedValue(
        newThreadField?.value ?? readPathValue(record, matchedField),
      ),
      matched_excerpt: buildMatchedExcerpt(line, needle),
    };
  }
  const commandField = firstMatchedRecordField(record, ["payload.command"]);
  if (commandField || line.includes('"exec_command_') || line.includes('"command"')) {
    const matchedField = commandField?.field ?? "payload.command";
    return {
      strength: "mention",
      evidence_kind: "command_output",
      matched_field: matchedField,
      matched_event: eventType,
      matched_value: stringifyMatchedValue(
        commandField?.value ?? readPathValue(record, matchedField),
      ),
      matched_excerpt: buildMatchedExcerpt(line, needle),
    };
  }
  const toolFieldMatch = firstMatchedRecordField(record, [
    "payload.arguments",
    "payload.tool",
  ]);
  if (toolFieldMatch || line.includes('"mcp_tool_call_') || line.includes('"tool_call"') || line.includes('"tool"')) {
    const toolField = toolFieldMatch?.field ??
      (readPathValue(record, "payload.arguments") !== undefined ? "payload.arguments" : "payload.tool");
    return {
      strength: "mention",
      evidence_kind: "tool_output",
      matched_field: toolField,
      matched_event: eventType,
      matched_value: stringifyMatchedValue(
        toolFieldMatch?.value ?? readPathValue(record, toolField),
      ),
      matched_excerpt: buildMatchedExcerpt(line, needle),
    };
  }
  const searchField = firstMatchedRecordField(record, ["payload.search"]);
  if (searchField || line.includes('"search"') || line.includes("rg ") || line.includes("ripgrep")) {
    return {
      strength: "mention",
      evidence_kind: "search_text",
      matched_field: searchField?.field ?? "payload.search",
      matched_event: eventType,
      matched_value:
        stringifyMatchedValue(searchField?.value ?? readPathValue(record, "payload.search")) ||
        buildMatchedExcerpt(line, needle),
      matched_excerpt: buildMatchedExcerpt(line, needle),
    };
  }
  const contentField = firstMatchedRecordField(record, [
    "payload.content",
    "payload.message",
  ]);
  if (contentField || line.includes('"content"') || line.includes('"message"') || line.includes('"role"')) {
    const matchedField = contentField?.field ?? "payload.content";
    return {
      strength: "mention",
      evidence_kind: "copied_context",
      matched_field: matchedField,
      matched_event: eventType,
      matched_value: stringifyMatchedValue(
        contentField?.value ?? readPathValue(record, matchedField),
      ),
      matched_excerpt: buildMatchedExcerpt(line, needle),
    };
  }
  return {
    strength: "mention",
    evidence_kind: "generic_mention",
    matched_field: "line",
    matched_event: eventType,
    matched_value: needle,
    matched_excerpt: buildMatchedExcerpt(line, needle),
  };
}

function evidenceRank(evidence: CrossSessionEvidenceTs): number {
  const kindRank: Record<CrossSessionEvidenceTs["evidence_kind"], number> = {
    parent_thread_id: 70,
    forked_from_id: 69,
    new_thread_id: 68,
    command_output: 30,
    tool_output: 29,
    search_text: 28,
    copied_context: 27,
    generic_mention: 20,
  };
  const strengthRank = evidence.strength === "strong" ? 100 : 0;
  return strengthRank + kindRank[evidence.evidence_kind];
}

function chooseBetterEvidence(
  current: CrossSessionEvidenceTs | undefined,
  candidate: CrossSessionEvidenceTs,
): CrossSessionEvidenceTs {
  if (!current) return candidate;
  if (evidenceRank(candidate) > evidenceRank(current)) return candidate;
  return current;
}

async function findMentionedThreadStrengthsInFile(
  filePath: string,
  candidateIds: string[],
): Promise<Map<string, CrossSessionEvidenceTs>> {
  const found = new Map<string, CrossSessionEvidenceTs>();
  if (!filePath || candidateIds.length === 0) return found;
  const normalizedCandidateIds = Array.from(
    new Set(candidateIds.map((item) => String(item || "").trim()).filter(Boolean)),
  );
  const candidateLookup = new Map(
    normalizedCandidateIds.map((item) => [item.toLowerCase(), item]),
  );
  const useUuidPattern = normalizedCandidateIds.every((item) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item),
  );
  const uuidPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
  const alternationPattern = useUuidPattern
    ? null
    : new RegExp(
        normalizedCandidateIds
          .map((item) => escapeRegExp(item))
          .sort((left, right) => right.length - left.length)
          .join("|"),
        "g",
      );

  try {
    const lines = createInterface({
      input: createReadStream(filePath, { encoding: "utf-8", highWaterMark: 64 * 1024 }),
      crlfDelay: Infinity,
    });
    for await (const line of lines) {
      const matchedNeedles = useUuidPattern
        ? Array.from(
            new Set(
              Array.from(line.matchAll(uuidPattern))
                .map((match) => candidateLookup.get(String(match[0] || "").toLowerCase()))
                .filter((match): match is string => Boolean(match)),
            ),
          )
        : Array.from(
            new Set(
              Array.from(line.matchAll(alternationPattern!))
                .map((match) => String(match[0] || "").trim())
                .filter(Boolean),
            ),
          );
      for (const matchedNeedle of matchedNeedles) {
        const evidence = classifyLineEvidence(line, matchedNeedle);
        found.set(
          matchedNeedle,
          chooseBetterEvidence(found.get(matchedNeedle), evidence),
        );
      }
      if (found.size >= candidateIds.length) {
        lines.close();
        break;
      }
    }
  } catch {
    return found;
  }
  return found;
}

async function classifyNeedleInFile(
  filePath: string,
  needle: string,
): Promise<CrossSessionEvidenceTs | null> {
  if (!filePath || !needle) return null;
  try {
    const lines = createInterface({
      input: createReadStream(filePath, { encoding: "utf-8", highWaterMark: 64 * 1024 }),
      crlfDelay: Infinity,
    });
    let result: CrossSessionEvidenceTs | null = null;
    for await (const line of lines) {
      if (!line.includes(needle)) continue;
      const evidence = classifyLineEvidence(line, needle);
      result = chooseBetterEvidence(result ?? undefined, evidence);
      if (evidence.strength === "strong") {
        lines.close();
        break;
      }
    }
    return result;
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workerCount = Math.max(1, Math.min(concurrency, queue.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (queue.length > 0) {
        const next = queue.shift();
        if (!next) return;
        await worker(next);
      }
    }),
  );
}

async function resolveCrossSessionRowsTs(
  sessionScanLimit: number,
  resolveCrossSessionRows?: () => Promise<CrossSessionRowTs[]>,
): Promise<CrossSessionRowTs[]> {
  if (resolveCrossSessionRows) {
    return (await resolveCrossSessionRows())
      .map((row) => ({
        session_id: String(row.session_id || "").trim(),
        display_title: String(row.display_title || "").trim(),
        file_path: String(row.file_path || "").trim(),
      }))
      .filter((row) => row.session_id && row.file_path);
  }
  const data = await getProviderSessionsTs("codex", sessionScanLimit);
  return (data.rows ?? [])
    .map((row) => ({
      session_id: String(row.session_id || "").trim(),
      display_title: String(row.display_title || "").trim(),
      file_path: String(row.file_path || "").trim(),
    }))
    .filter((row) => row.session_id && row.file_path);
}

async function collectCrossSessionLinksByThreadTs(
  ids: string[],
  resolveSessionPath: (threadId: string) => Promise<string | null>,
  sessionScanLimit: number,
  resolveCrossSessionRows?: () => Promise<CrossSessionRowTs[]>,
): Promise<{ links: Map<string, AnalyzeDeleteCrossSessionLinksTs>; scanCandidates: number }> {
  const normalizedIds = Array.from(new Set(ids.map((item) => String(item || "").trim()).filter(Boolean)));
  const links = new Map<string, AnalyzeDeleteCrossSessionLinksTs>();
  if (!normalizedIds.length) return { links, scanCandidates: 0 };

  const recentRows = await resolveCrossSessionRowsTs(sessionScanLimit, resolveCrossSessionRows);
  const rowsById = new Map<string, CrossSessionRowTs>();
  for (const row of recentRows) {
    if (!rowsById.has(row.session_id)) {
      rowsById.set(row.session_id, row);
    }
  }

  const titleById = new Map<string, string>();
  for (const row of recentRows) {
    if (row.display_title) {
      titleById.set(row.session_id, row.display_title);
    }
  }

  for (const threadId of normalizedIds) {
    const targetPath =
      rowsById.get(threadId)?.file_path ?? (await resolveSessionPath(threadId)) ?? "";
    const candidateIds = Array.from(rowsById.keys()).filter((candidateId) => candidateId !== threadId);
    const outbound = targetPath
      ? await findMentionedThreadStrengthsInFile(targetPath, candidateIds)
      : new Map<string, CrossSessionEvidenceTs>();
    const inbound = new Map<string, CrossSessionEvidenceTs>();
    const candidateEntries = Array.from(rowsById.entries()).filter(([candidateId]) => candidateId && candidateId !== threadId);
    const rgMatchedPaths = await findFilesContainingNeedleWithRg(
      candidateEntries.map(([, row]) => row.file_path),
      threadId,
    );
    const inboundCandidates =
      rgMatchedPaths === null
        ? candidateEntries
        : candidateEntries.filter(([, row]) => rgMatchedPaths.has(row.file_path));
    await mapWithConcurrency(
      inboundCandidates,
      6,
      async ([candidateId, row]) => {
        if (!candidateId || candidateId === threadId) return;
        const evidence = await classifyNeedleInFile(row.file_path, threadId);
        if (evidence) {
          inbound.set(candidateId, chooseBetterEvidence(inbound.get(candidateId), evidence));
        }
      },
    );

    const strongRelated = new Set<string>();
    const mentionRelated = new Set<string>();
    for (const candidateId of candidateIds) {
      const outboundEvidence = outbound.get(candidateId);
      const inboundEvidence = inbound.get(candidateId);
      const hasStrong = outboundEvidence?.strength === "strong" || inboundEvidence?.strength === "strong";
      const hasMention = Boolean(outboundEvidence || inboundEvidence);
      if (hasStrong) {
        strongRelated.add(candidateId);
      } else if (hasMention) {
        mentionRelated.add(candidateId);
      }
    }

    const relatedIds = Array.from(new Set([...strongRelated, ...mentionRelated])).sort((left, right) => {
      const leftDirection = outbound.has(left) && inbound.has(left) ? 0 : inbound.has(left) ? 1 : 2;
      const rightDirection = outbound.has(right) && inbound.has(right) ? 0 : inbound.has(right) ? 1 : 2;
      if (leftDirection !== rightDirection) return leftDirection - rightDirection;
      return (titleById.get(left) || left).localeCompare(titleById.get(right) || right);
    });

    const buildSample = (
      relatedId: string,
      strength: "strong" | "mention",
    ): AnalyzeDeleteCrossSessionSampleTs => {
      const chosenEvidence = chooseBetterEvidence(
        outbound.get(relatedId),
        inbound.get(relatedId) ?? {
          strength,
          evidence_kind: strength === "strong" ? "new_thread_id" : "generic_mention",
        },
      );
      return {
        thread_id: relatedId,
        title: titleById.get(relatedId) || undefined,
        direction: outbound.has(relatedId) && inbound.has(relatedId)
          ? "both"
          : inbound.has(relatedId)
            ? "inbound"
            : "outbound",
        strength,
        evidence_kind: chosenEvidence.evidence_kind,
        matched_field: chosenEvidence.matched_field,
        matched_event: chosenEvidence.matched_event,
        matched_value: chosenEvidence.matched_value,
        matched_excerpt: chosenEvidence.matched_excerpt,
      };
    };

    links.set(threadId, {
      strong_links: strongRelated.size,
      mention_links: mentionRelated.size,
      related_threads: relatedIds.length,
      strong_samples: Array.from(strongRelated)
        .sort((left, right) => (titleById.get(left) || left).localeCompare(titleById.get(right) || right))
        .map((relatedId) => buildSample(relatedId, "strong")),
      mention_samples: Array.from(mentionRelated)
        .sort((left, right) => (titleById.get(left) || left).localeCompare(titleById.get(right) || right))
        .map((relatedId) => buildSample(relatedId, "mention")),
      related_samples: relatedIds.map((relatedId) =>
        buildSample(relatedId, strongRelated.has(relatedId) ? "strong" : "mention"),
      ),
    });
  }

  return { links, scanCandidates: recentRows.length };
}

const DEFAULT_SESSION_SCAN_LIMIT = 80;
const MAX_SESSION_SCAN_LIMIT = 240;

export async function analyzeDeleteImpactTs(
  threadIds: string[],
  options?: {
    stateFilePath?: string;
    chatDir?: string;
    sessionScanLimit?: number;
    resolveSessionPath?: (threadId: string) => Promise<string | null>;
    resolveCrossSessionRows?: () => Promise<CrossSessionRowTs[]>;
  },
): Promise<AnalyzeDeleteDataTs> {
  const ids = Array.from(
    new Set(threadIds.map((item) => String(item || "").trim()).filter(Boolean)),
  );
  const sessionScanLimit = Math.min(
    MAX_SESSION_SCAN_LIMIT,
    Math.max(1, options?.sessionScanLimit ?? DEFAULT_SESSION_SCAN_LIMIT),
  );
  const state = await loadCodexUiState(options?.stateFilePath);
  const titles = state.titles;
  const orderSet = new Set(state.order);
  const pinnedSet = new Set(state.pinned);
  const { refs, bucketCounts } = await collectCodexLocalRefs(ids, options?.chatDir ?? CHAT_DIR);
  const resolveSessionPath =
    options?.resolveSessionPath ?? resolveCodexSessionPathByThreadId;
  const crossSessionResult =
    options?.resolveSessionPath && !options?.resolveCrossSessionRows
      ? { links: new Map(ids.map((threadId) => [threadId, emptyCrossSessionLinks()] as const)), scanCandidates: 0 }
      : await collectCrossSessionLinksByThreadTs(
          ids,
          resolveSessionPath,
          sessionScanLimit,
          options?.resolveCrossSessionRows,
        );
  const crossSessionLinks = crossSessionResult.links;

  const reports: AnalyzeDeleteReportTs[] = [];
  for (const threadId of ids) {
    const sessionMeta = await readCodexSessionMetaForThreadIdWithResolver(
      threadId,
      resolveSessionPath,
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
      cross_session_links: crossSessionLinks.get(threadId),
    });
  }

  return {
    count: ids.length,
    reports,
    session_scan_limit: sessionScanLimit,
    session_scan_candidates: crossSessionResult.scanCandidates,
  };
}
