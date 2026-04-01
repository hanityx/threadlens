import { stat } from "node:fs/promises";
import path from "node:path";
import { SEARCHABLE_PROVIDER_IDS } from "@threadlens/shared-contracts";

import { buildSessionTranscript } from "./transcript.js";
import type {
  ConversationSearchPayload,
  ConversationSearchResult,
  ProviderId,
  ProviderSessionRow,
  ProviderSessionScan,
  TranscriptPayload,
} from "../../lib/providers.js";
import {
  buildSearchSnippet,
  buildSearchTokens,
  codexTranscriptSearchRoots,
  extractCodexThreadIdFromSessionName,
  fallbackDisplayTitle,
  getCodexThreadTitleMap,
  inferSessionId,
  invalidateCodexThreadTitleMapCache,
  isCopilotGlobalSessionLikeFile,
  isWorkspaceChatSessionPath,
  matchesConversationSearch,
  normalizeSearchQuery,
  normalizeSearchText,
  probeSessionFile,
  providerName,
  providerScanRootSpecs,
  providerStatus,
} from "../../lib/providers.js";
import {
  nowIsoUtc,
  walkFilesByExt,
} from "../../lib/utils.js";

const PROVIDER_SCAN_CACHE_TTL_MS = 60_000;
const DEFAULT_CONVERSATION_SEARCH_PROVIDERS: ProviderId[] = [...SEARCHABLE_PROVIDER_IDS];
const DEFAULT_CONVERSATION_SEARCH_LIMIT = 40;
const MAX_CONVERSATION_SEARCH_LIMIT = 200;
const DEFAULT_CONVERSATION_SEARCH_TRANSCRIPT_LIMIT = 10_000;
const MAX_CONVERSATION_SEARCH_SCAN_LIMIT = 1_200;
const SEARCH_TRANSCRIPT_CONCURRENCY = 4;
const SEARCH_TRANSCRIPT_CACHE_MAX_ENTRIES = 2_000;
const DEFAULT_CONVERSATION_SEARCH_SCAN_MULTIPLIER = 4;
const DEFAULT_CONVERSATION_SEARCH_SCAN_FLOOR = 160;
const PROVIDER_SCAN_BUDGET_WEIGHTS: Record<ProviderId, number> = {
  codex: 1.35,
  chatgpt: 0.6,
  claude: 1.35,
  gemini: 1,
  copilot: 0.85,
};

type ProviderScanCacheEntry = {
  expires_at: number;
  scan: ProviderSessionScan;
};

type ConversationTranscriptLoader = (
  provider: ProviderId,
  filePath: string,
) => Promise<TranscriptPayload>;

type CachedConversationTranscriptLoader = (
  row: ProviderSessionRow,
) => Promise<TranscriptPayload | null>;

type TranscriptSearchCacheEntry = {
  mtime: string;
  transcript: TranscriptPayload | null;
};

// Detects injected policy/system-prompt messages that appear as user role in Codex sessions.
// These are AGENTS.md instructions, permission blocks, or assistant persona declarations
// injected at conversation start — not actual user input.
function isPolicyInjectionMessage(text: string): boolean {
  const t = text.trimStart();
  return (
    t.startsWith("# AGENTS.md instructions for") ||
    t.startsWith("<INSTRUCTIONS>") ||
    t.startsWith("<permissions instructions>") ||
    /^You are (Codex|Assist|Claude|Gemini|GPT|ChatGPT|Copilot)\b/i.test(t) ||
    (t.startsWith("# ") && t.includes("<INSTRUCTIONS>"))
  );
}

const providerScanCache = new Map<string, ProviderScanCacheEntry>();
const providerScanInflight = new Map<string, Promise<ProviderSessionScan>>();
const transcriptSearchCache = new Map<string, TranscriptSearchCacheEntry>();

export function invalidateProviderSearchCaches(provider: ProviderId) {
  for (const key of providerScanCache.keys()) {
    if (key.startsWith(`${provider}:`)) {
      providerScanCache.delete(key);
    }
  }
  for (const key of providerScanInflight.keys()) {
    if (key.startsWith(`${provider}:`)) {
      providerScanInflight.delete(key);
    }
  }
}

function providerScanCacheKey(provider: ProviderId, limit: number): string {
  return `${provider}:${limit}`;
}

function transcriptSearchCacheKey(row: ProviderSessionRow): string {
  return `${row.provider}:${path.resolve(row.file_path)}`;
}

function trimTranscriptSearchCache() {
  while (transcriptSearchCache.size > SEARCH_TRANSCRIPT_CACHE_MAX_ENTRIES) {
    const oldestKey = transcriptSearchCache.keys().next().value;
    if (!oldestKey) return;
    transcriptSearchCache.delete(oldestKey);
  }
}

export function resolveConversationSearchLimits(options?: {
  limit?: number;
  sessionLimitPerProvider?: number;
}) {
  const resultLimit = Math.max(
    1,
    Math.min(
      MAX_CONVERSATION_SEARCH_LIMIT,
      Number(options?.limit) || DEFAULT_CONVERSATION_SEARCH_LIMIT,
    ),
  );
  const scanLimit = Math.max(
    DEFAULT_CONVERSATION_SEARCH_SCAN_FLOOR,
    Math.min(
      MAX_CONVERSATION_SEARCH_SCAN_LIMIT,
      Number(options?.sessionLimitPerProvider) ||
        Math.max(
          resultLimit * DEFAULT_CONVERSATION_SEARCH_SCAN_MULTIPLIER,
          DEFAULT_CONVERSATION_SEARCH_SCAN_FLOOR,
        ),
    ),
  );
  return {
    resultLimit,
    scanLimit,
  };
}

export function buildConversationSearchProviderBudgets(
  providers: ProviderId[],
  totalBudget: number,
): Array<{ provider: ProviderId; limit: number }> {
  const uniqueProviders = Array.from(new Set(providers));
  const safeBudget = Math.max(1, Math.floor(totalBudget));
  if (!uniqueProviders.length) return [];
  if (uniqueProviders.length === 1) {
    return [{ provider: uniqueProviders[0], limit: safeBudget }];
  }

  const weightedProviders = uniqueProviders.map((provider) => ({
    provider,
    weight: PROVIDER_SCAN_BUDGET_WEIGHTS[provider] ?? 1,
  }));
  const totalWeight = weightedProviders.reduce(
    (sum, entry) => sum + entry.weight,
    0,
  );

  const provisional = weightedProviders.map((entry) => {
    const exact = (safeBudget * entry.weight) / totalWeight;
    return {
      provider: entry.provider,
      exact,
      limit: Math.max(1, Math.floor(exact)),
    };
  });

  let remaining = safeBudget - provisional.reduce((sum, entry) => sum + entry.limit, 0);
  provisional
    .sort((a, b) => (b.exact - b.limit) - (a.exact - a.limit))
    .forEach((entry) => {
      if (remaining <= 0) return;
      entry.limit += 1;
      remaining -= 1;
    });

  const limitByProvider = new Map(
    provisional.map((entry) => [entry.provider, entry.limit] as const),
  );
  return uniqueProviders.map((provider) => ({
    provider,
    limit: limitByProvider.get(provider) ?? 1,
  }));
}

export function createCachedConversationTranscriptLoader(
  baseLoader: ConversationTranscriptLoader,
): CachedConversationTranscriptLoader {
  return async (row) => {
    const key = transcriptSearchCacheKey(row);
    const cached = transcriptSearchCache.get(key);
    if (cached && cached.mtime === row.mtime) {
      transcriptSearchCache.delete(key);
      transcriptSearchCache.set(key, cached);
      return cached.transcript;
    }

    const transcript = await baseLoader(row.provider, row.file_path).catch(() => null);
    transcriptSearchCache.set(key, {
      mtime: row.mtime,
      transcript,
    });
    trimTranscriptSearchCache();
    return transcript;
  };
}

function conversationSearchResultDedupKey(result: ConversationSearchResult): string {
  return [
    result.provider,
    result.session_id,
    result.file_path,
    result.match_kind,
    result.role || "",
    normalizeSearchText(result.snippet).toLowerCase(),
  ].join("::");
}

function dedupeConversationSearchResults(
  results: ConversationSearchResult[],
): ConversationSearchResult[] {
  const deduped: ConversationSearchResult[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    const key = conversationSearchResultDedupKey(result);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(result);
  }
  return deduped;
}

async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  if (items.length === 0) return [];
  const results = new Array<U>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        if (currentIndex >= items.length) return;
        results[currentIndex] = await worker(items[currentIndex], currentIndex);
      }
    }),
  );

  return results;
}

async function scanProviderSessions(
  provider: ProviderId,
  limit = 80,
  options?: { maxLimit?: number },
): Promise<ProviderSessionScan> {
  const startedAt = Date.now();
  const hardLimit = Math.max(
    1,
    Number(options?.maxLimit) || MAX_CONVERSATION_SEARCH_SCAN_LIMIT,
  );
  const safeLimit = Math.max(1, Math.min(hardLimit, Number(limit) || 80));
  const roots = await providerScanRootSpecs(provider);
  const rootExists =
    provider === "chatgpt"
      ? roots.length > 0
      : (await Promise.all(roots.map((r) => walkRootExists(r.root)))).some(Boolean);

  const candidates: Array<{
    source: string;
    file_path: string;
    size_bytes: number;
    mtime: string;
    mtime_ms: number;
  }> = [];
  const gatherLimit = Math.max(safeLimit * 2, 80);

  const rootFiles = await Promise.all(
    roots.map((spec) => {
      const providerLimit =
        provider === "copilot" &&
        (spec.source === "vscode_workspace_chats" ||
          spec.source === "cursor_workspace_chats")
          ? Math.max(gatherLimit * 8, 1200)
          : gatherLimit;
      return walkFilesByExt(spec.root, spec.exts, providerLimit);
    }),
  );

  for (let i = 0; i < roots.length; i += 1) {
    const spec = roots[i];
    const files = rootFiles[i] ?? [];
    const filteredFiles =
      provider === "copilot" &&
      (spec.source === "vscode_workspace_chats" ||
        spec.source === "cursor_workspace_chats")
        ? files.filter((filePath) => isWorkspaceChatSessionPath(filePath))
        : provider === "copilot" &&
            (spec.source === "vscode_global" || spec.source === "cursor_global")
          ? files.filter((filePath) => isCopilotGlobalSessionLikeFile(filePath))
          : files;

    for (const file of filteredFiles) {
      try {
        const st = await stat(file);
        candidates.push({
          source: spec.source,
          file_path: file,
          size_bytes: Number(st.size),
          mtime: new Date(Number(st.mtimeMs)).toISOString(),
          mtime_ms: Number(st.mtimeMs),
        });
      } catch {
        // no-op
      }
    }
  }

  candidates.sort((a, b) => b.mtime_ms - a.mtime_ms);
  const selected = candidates.slice(0, safeLimit);
  const codexTitleMap =
    provider === "codex" ? await getCodexThreadTitleMap() : null;
  const rows: ProviderSessionRow[] = await Promise.all(
    selected.map(async (candidate) => {
      const rawSessionId = inferSessionId(candidate.file_path);
      const codexThreadId =
        provider === "codex"
          ? extractCodexThreadIdFromSessionName(rawSessionId)
          : "";
      const sessionId = codexThreadId || rawSessionId;
      const probe = await probeSessionFile(candidate.file_path);
      return {
        provider,
        source: candidate.source,
        session_id: sessionId,
        display_title:
          (codexTitleMap && codexThreadId
            ? codexTitleMap.get(codexThreadId)
            : "") ||
          probe.detected_title ||
          fallbackDisplayTitle(provider, sessionId, candidate.source),
        file_path: candidate.file_path,
        size_bytes: candidate.size_bytes,
        mtime: candidate.mtime,
        probe,
      };
    }),
  );

  return {
    provider,
    name: providerName(provider),
    status: providerStatus(rootExists, candidates.length),
    rows,
    scanned: rows.length,
    truncated: candidates.length > safeLimit,
    scan_ms: Math.max(0, Date.now() - startedAt),
  };
}

async function walkRootExists(root: string): Promise<boolean> {
  try {
    await stat(root);
    return true;
  } catch {
    return false;
  }
}

export async function getProviderSessionScan(
  provider: ProviderId,
  limit = 80,
  options?: { forceRefresh?: boolean },
): Promise<ProviderSessionScan> {
  const safeLimit = Math.max(
    1,
    Math.min(MAX_CONVERSATION_SEARCH_SCAN_LIMIT, Number(limit) || 80),
  );
  const key = providerScanCacheKey(provider, safeLimit);
  const forceRefresh = Boolean(options?.forceRefresh);
  const now = Date.now();

  if (!forceRefresh) {
    const cached = providerScanCache.get(key);
    if (cached && cached.expires_at > now) return cached.scan;
  } else {
    invalidateProviderSearchCaches(provider);
    if (provider === "codex") {
      invalidateCodexThreadTitleMapCache();
    }
  }

  const inflight = providerScanInflight.get(key);
  if (inflight) return inflight;

  const task = scanProviderSessions(provider, safeLimit)
    .then((scan) => {
      providerScanCache.set(key, {
        expires_at: Date.now() + PROVIDER_SCAN_CACHE_TTL_MS,
        scan,
      });
      return scan;
    })
    .finally(() => {
      providerScanInflight.delete(key);
    });

  providerScanInflight.set(key, task);
  return task;
}

export function defaultConversationSearchProviders(): ProviderId[] {
  return [...DEFAULT_CONVERSATION_SEARCH_PROVIDERS];
}

function buildSearchIdentity(
  row: ProviderSessionRow,
  openableThreadIds?: Set<string>,
): {
  sessionId: string;
  threadId: string | null;
  title: string;
} {
  const rawSessionId = inferSessionId(row.file_path) || row.session_id;
  const threadIdCandidate =
    row.provider === "codex"
      ? extractCodexThreadIdFromSessionName(rawSessionId) ||
        extractCodexThreadIdFromSessionName(row.session_id) ||
        row.session_id ||
        ""
      : "";
  const threadId =
    threadIdCandidate && openableThreadIds
      ? openableThreadIds.has(threadIdCandidate)
        ? threadIdCandidate
        : ""
      : threadIdCandidate;

  return {
    sessionId: rawSessionId,
    threadId: threadId || null,
    title:
      row.display_title ||
      row.probe.detected_title ||
      fallbackDisplayTitle(row.provider, row.session_id, row.source),
  };
}

export function isMetadataOnlyConversationQuery(query: string): boolean {
  const normalized = normalizeSearchText(query);
  if (!normalized) return false;
  if (/[\\/]/.test(normalized)) return true;
  if (/\.(jsonl|json|data|md|txt)\b/i.test(normalized)) return true;
  if (/^rollout-\d{4}-\d{2}-\d{2}/i.test(normalized)) return true;
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4,}(?:-[0-9a-f]{4,}){2,}$/i.test(normalized)
  ) {
    return true;
  }
  return false;
}

function buildBaseSearchResult(
  row: ProviderSessionRow,
  identity: ReturnType<typeof buildSearchIdentity>,
) {
  return {
    provider: row.provider,
    session_id: identity.sessionId,
    title: identity.title,
    file_path: row.file_path,
    mtime: row.mtime,
    ...(identity.threadId ? { thread_id: identity.threadId } : {}),
  };
}

function buildMetadataSearchResult(
  row: ProviderSessionRow,
  identity: ReturnType<typeof buildSearchIdentity>,
  normalizedQuery: string,
  tokens: string[],
): ConversationSearchResult | null {
  const metadataCandidates = [
    identity.title,
    identity.sessionId,
    row.source,
    path.basename(row.file_path),
    providerName(row.provider),
    row.file_path,
  ]
    .map((value) => normalizeSearchText(value))
    .filter(Boolean);

  for (const candidate of metadataCandidates) {
    if (!matchesConversationSearch(candidate, normalizedQuery, tokens)) continue;
    return {
      ...buildBaseSearchResult(row, identity),
      match_kind: "title",
      snippet: buildSearchSnippet(candidate, normalizedQuery, tokens, 140),
    };
  }

  return null;
}

export async function searchConversationRows(
  rows: ProviderSessionRow[],
  q: string,
  options?: {
    limit?: number;
    transcriptLoader?: ConversationTranscriptLoader;
    transcriptLimit?: number;
    openableThreadIds?: Set<string>;
  },
): Promise<{
  searched_sessions: number;
  available_sessions: number;
  truncated: boolean;
  results: ConversationSearchResult[];
}> {
  const trimmedQuery = normalizeSearchText(q);
  const normalizedQuery = normalizeSearchQuery(trimmedQuery);
  const tokens = buildSearchTokens(trimmedQuery);
  const { resultLimit: safeLimit } = resolveConversationSearchLimits({
    limit: options?.limit,
  });
  const transcriptLimit = Math.max(
    100,
    Math.min(
      DEFAULT_CONVERSATION_SEARCH_TRANSCRIPT_LIMIT,
      Number(options?.transcriptLimit) ||
        DEFAULT_CONVERSATION_SEARCH_TRANSCRIPT_LIMIT,
    ),
  );
  const transcriptLoader =
    options?.transcriptLoader ??
    ((provider: ProviderId, filePath: string) =>
      buildSessionTranscript(provider, filePath, transcriptLimit));
  const metadataOnlyQuery = isMetadataOnlyConversationQuery(trimmedQuery);
  const cachedTranscriptLoader =
    createCachedConversationTranscriptLoader(transcriptLoader);
  const seenPaths = new Set<string>();
  const sortedRows = [...rows]
    .sort(
      (a, b) =>
        Date.parse(String(b.mtime || "")) - Date.parse(String(a.mtime || "")),
    )
    .filter((row) => {
      const key = `${row.provider}:${path.resolve(row.file_path)}`;
      if (seenPaths.has(key)) return false;
      seenPaths.add(key);
      return true;
    });
  const metadataResults: ConversationSearchResult[] = [];
  const transcriptRows: Array<{
    row: ProviderSessionRow;
    identity: ReturnType<typeof buildSearchIdentity>;
  }> = [];

  for (const row of sortedRows) {
    const identity = buildSearchIdentity(row, options?.openableThreadIds);
    const metadataResult = buildMetadataSearchResult(
      row,
      identity,
      normalizedQuery,
      tokens,
    );
    if (metadataResult) {
      metadataResults.push(metadataResult);
      continue;
    }
    transcriptRows.push({ row, identity });
  }

  let results = dedupeConversationSearchResults(metadataResults);
  const metadataSatisfiesLimit = results.length >= safeLimit;
  const metadataOnlyTruncated =
    results.length > safeLimit ||
    (metadataSatisfiesLimit && transcriptRows.length > 0);

  if (!metadataSatisfiesLimit && !metadataOnlyQuery) {
    let transcriptStoppedEarly = false;
    for (
      let offset = 0;
      offset < transcriptRows.length && results.length < safeLimit;
      offset += SEARCH_TRANSCRIPT_CONCURRENCY
    ) {
      const chunk = transcriptRows.slice(
        offset,
        offset + SEARCH_TRANSCRIPT_CONCURRENCY,
      );
      const chunkResults = await mapWithConcurrency(
        chunk,
        SEARCH_TRANSCRIPT_CONCURRENCY,
        async ({ row, identity }) => {
          const rowResults: ConversationSearchResult[] = [];
          const baseResult = buildBaseSearchResult(row, identity);
          const transcript = await cachedTranscriptLoader(row);
          if (!transcript?.messages?.length) return rowResults;

          for (let i = 0; i < transcript.messages.length; i += 1) {
            const message = transcript.messages[i];
            if (message.role === "system" || message.role === "tool") continue;
            if (isPolicyInjectionMessage(message.text)) continue;
            if (
              !matchesConversationSearch(message.text, normalizedQuery, tokens)
            ) {
              continue;
            }
            rowResults.push({
              ...baseResult,
              match_kind: "message",
              snippet: buildSearchSnippet(message.text, normalizedQuery, tokens),
              role: message.role,
            });
          }

          return rowResults;
        },
      );

      results = dedupeConversationSearchResults([
        ...results,
        ...chunkResults.flat(),
      ]);
      if (
        results.length >= safeLimit &&
        offset + chunk.length < transcriptRows.length
      ) {
        transcriptStoppedEarly = true;
      }

      if (results.length >= safeLimit) {
        return {
          searched_sessions: sortedRows.length,
          available_sessions: sortedRows.length,
          truncated: results.length > safeLimit || transcriptStoppedEarly,
          results: results.slice(0, safeLimit),
        };
      }
    }
  }

  return {
    searched_sessions: sortedRows.length,
    available_sessions: sortedRows.length,
    truncated: metadataOnlyTruncated || results.length > safeLimit,
    results: results.slice(0, safeLimit),
  };
}

async function resolveOpenableThreadIds(
  forceRefresh: boolean,
): Promise<Set<string>> {
  const { getThreadsTs } = await import("../threads/query.js");
  const threads = await getThreadsTs({
    offset: "0",
    limit: "240",
    q: "",
    sort: "updated_desc",
    ...(forceRefresh ? { refresh: "1" } : {}),
  });
  return new Set(
    (threads.rows ?? [])
      .map((row) => String(row.thread_id || "").trim())
      .filter(Boolean),
  );
}

export async function searchLocalConversationsTs(
  q: string,
  options?: {
    providers?: ProviderId[];
    limit?: number;
    forceRefresh?: boolean;
    transcriptLimit?: number;
    sessionLimitPerProvider?: number;
  },
): Promise<ConversationSearchPayload> {
  const trimmedQuery = normalizeSearchText(q);
  const providers =
    options?.providers?.length ? Array.from(new Set(options.providers)) : defaultConversationSearchProviders();
  const { resultLimit: safeLimit, scanLimit } = resolveConversationSearchLimits({
    limit: options?.limit,
    sessionLimitPerProvider: options?.sessionLimitPerProvider,
  });
  const forceRefresh = Boolean(options?.forceRefresh);
  const explicitPerProviderLimit = Math.max(
    0,
    Math.floor(Number(options?.sessionLimitPerProvider) || 0),
  );
  const providerBudgets =
    explicitPerProviderLimit > 0
      ? providers.map((provider) => ({
          provider,
          limit: explicitPerProviderLimit,
        }))
      : buildConversationSearchProviderBudgets(providers, scanLimit);
  const scans = await Promise.all(
    providerBudgets.map(({ provider, limit }) =>
      getProviderSessionScan(provider, limit, { forceRefresh }),
    ),
  );
  const rows = scans.flatMap((scan) => scan.rows);
  const openableThreadIds = await resolveOpenableThreadIds(forceRefresh);
  const result = await searchConversationRows(rows, trimmedQuery, {
    limit: safeLimit,
    transcriptLimit: options?.transcriptLimit,
    openableThreadIds,
  });

  return {
    generated_at: nowIsoUtc(),
    q: trimmedQuery,
    providers,
    limit: safeLimit,
    searched_sessions: result.searched_sessions,
    available_sessions: result.available_sessions,
    truncated: result.truncated,
    results: result.results,
  };
}

export async function getProviderSessionsTs(
  provider?: ProviderId,
  limit = 80,
  options?: { forceRefresh?: boolean },
) {
  const targets: ProviderId[] = provider
    ? [provider]
    : ["codex", "chatgpt", "claude", "gemini", "copilot"];
  const scans = await Promise.all(
    targets.map((p) => getProviderSessionScan(p, limit, options)),
  );

  const rows = scans.flatMap((scan) => scan.rows);
  return {
    generated_at: nowIsoUtc(),
    summary: {
      providers: scans.length,
      rows: rows.length,
      parse_ok: rows.filter((row) => row.probe.ok).length,
      parse_fail: rows.filter((row) => !row.probe.ok).length,
    },
    providers: scans.map((scan) => ({
      provider: scan.provider,
      name: scan.name,
      status: scan.status,
      scanned: scan.scanned,
      truncated: scan.truncated,
      scan_ms: scan.scan_ms,
    })),
    rows,
  };
}

export async function getProviderParserHealthTs(
  provider?: ProviderId,
  limitPerProvider = 80,
  options?: { forceRefresh?: boolean },
) {
  const targets: ProviderId[] = provider
    ? [provider]
    : ["codex", "chatgpt", "claude", "gemini", "copilot"];
  const scans = await Promise.all(
    targets.map((item) => getProviderSessionScan(item, limitPerProvider, options)),
  );
  const reports: Array<Record<string, unknown>> = scans.map((scan) => {
    const parseOk = scan.rows.filter((row) => row.probe.ok).length;
    const parseFail = scan.rows.length - parseOk;
    const score = scan.rows.length
      ? Number(((parseOk / scan.rows.length) * 100).toFixed(1))
      : null;
    return {
      provider: scan.provider,
      name: scan.name,
      status: scan.status,
      scanned: scan.rows.length,
      parse_ok: parseOk,
      parse_fail: parseFail,
      parse_score: score,
      truncated: scan.truncated,
      scan_ms: scan.scan_ms,
      sample_errors: scan.rows
        .filter((row) => !row.probe.ok)
        .slice(0, 8)
        .map((row) => ({
          session_id: row.session_id,
          path: row.file_path,
          format: row.probe.format,
          error: row.probe.error,
        })),
    };
  });
  const totalScanned = reports.reduce(
    (sum, row) => sum + Number((row.scanned as number) || 0),
    0,
  );
  const totalFail = reports.reduce(
    (sum, row) => sum + Number((row.parse_fail as number) || 0),
    0,
  );
  const totalOk = reports.reduce(
    (sum, row) => sum + Number((row.parse_ok as number) || 0),
    0,
  );
  return {
    generated_at: nowIsoUtc(),
    summary: {
      providers: reports.length,
      scanned: totalScanned,
      parse_ok: totalOk,
      parse_fail: totalFail,
      parse_score: totalScanned
        ? Number(((totalOk / totalScanned) * 100).toFixed(1))
        : null,
    },
    reports,
  };
}

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
