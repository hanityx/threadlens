import { stat } from "node:fs/promises";
import path from "node:path";

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
const DEFAULT_CONVERSATION_SEARCH_PROVIDERS: ProviderId[] = [
  "codex",
  "claude",
  "gemini",
];
const DEFAULT_CONVERSATION_SEARCH_LIMIT = 40;
const MAX_CONVERSATION_SEARCH_LIMIT = 200;
const DEFAULT_CONVERSATION_SEARCH_TRANSCRIPT_LIMIT = 10_000;
const MAX_CONVERSATION_SEARCH_SCAN_LIMIT = 1_200;

type ProviderScanCacheEntry = {
  expires_at: number;
  scan: ProviderSessionScan;
};

type ConversationTranscriptLoader = (
  provider: ProviderId,
  filePath: string,
) => Promise<TranscriptPayload>;

const providerScanCache = new Map<string, ProviderScanCacheEntry>();
const providerScanInflight = new Map<string, Promise<ProviderSessionScan>>();

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
  const safeLimit = Math.max(1, Math.min(240, Number(limit) || 80));
  const key = providerScanCacheKey(provider, safeLimit);
  const forceRefresh = Boolean(options?.forceRefresh);
  const now = Date.now();

  if (!forceRefresh) {
    const cached = providerScanCache.get(key);
    if (cached && cached.expires_at > now) return cached.scan;
  } else {
    providerScanCache.delete(key);
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

function buildSearchIdentity(row: ProviderSessionRow): {
  sessionId: string;
  threadId: string | null;
  title: string;
} {
  const rawSessionId = inferSessionId(row.file_path) || row.session_id;
  const threadId =
    row.provider === "codex"
      ? extractCodexThreadIdFromSessionName(rawSessionId) ||
        extractCodexThreadIdFromSessionName(row.session_id) ||
        row.session_id ||
        ""
      : "";

  return {
    sessionId: rawSessionId,
    threadId: threadId || null,
    title:
      row.display_title ||
      row.probe.detected_title ||
      fallbackDisplayTitle(row.provider, row.session_id, row.source),
  };
}

export async function searchConversationRows(
  rows: ProviderSessionRow[],
  q: string,
  options?: {
    limit?: number;
    transcriptLoader?: ConversationTranscriptLoader;
    transcriptLimit?: number;
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
  const safeLimit = Math.max(
    1,
    Math.min(
      MAX_CONVERSATION_SEARCH_LIMIT,
      Number(options?.limit) || DEFAULT_CONVERSATION_SEARCH_LIMIT,
    ),
  );
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

  const results: ConversationSearchResult[] = [];
  let searchedSessions = 0;

  for (const row of sortedRows) {
    searchedSessions += 1;
    const identity = buildSearchIdentity(row);
    const baseResult = {
      provider: row.provider,
      session_id: identity.sessionId,
      title: identity.title,
      file_path: row.file_path,
      mtime: row.mtime,
      ...(identity.threadId ? { thread_id: identity.threadId } : {}),
    };

    if (matchesConversationSearch(identity.title, normalizedQuery, tokens)) {
      results.push({
        ...baseResult,
        match_kind: "title",
        snippet: buildSearchSnippet(identity.title, normalizedQuery, tokens, 140),
      });
    }
    const transcript = await transcriptLoader(row.provider, row.file_path).catch(
      () => null,
    );
    if (!transcript?.messages?.length) continue;

    for (let i = 0; i < transcript.messages.length; i += 1) {
      const message = transcript.messages[i];
      if (!matchesConversationSearch(message.text, normalizedQuery, tokens)) {
        continue;
      }
      results.push({
        ...baseResult,
        match_kind: "message",
        snippet: buildSearchSnippet(message.text, normalizedQuery, tokens),
        role: message.role,
      });
    }
  }

  return {
    searched_sessions: searchedSessions,
    available_sessions: sortedRows.length,
    truncated: results.length > safeLimit,
    results: results.slice(0, safeLimit),
  };
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
  const safeLimit = Math.max(
    1,
    Math.min(
      MAX_CONVERSATION_SEARCH_LIMIT,
      Number(options?.limit) || DEFAULT_CONVERSATION_SEARCH_LIMIT,
    ),
  );
  const scanLimit = Math.max(
    80,
    Math.min(
      MAX_CONVERSATION_SEARCH_SCAN_LIMIT,
      Number(options?.sessionLimitPerProvider) || Math.max(safeLimit * 8, 240),
    ),
  );
  const forceRefresh = Boolean(options?.forceRefresh);
  const scans = await Promise.all(
    providers.map((provider) =>
      scanLimit <= 240
        ? getProviderSessionScan(provider, scanLimit, { forceRefresh })
        : scanProviderSessions(provider, scanLimit, {
            maxLimit: MAX_CONVERSATION_SEARCH_SCAN_LIMIT,
          }),
    ),
  );
  const rows = scans.flatMap((scan) => scan.rows);
  const result = await searchConversationRows(rows, trimmedQuery, {
    limit: safeLimit,
    transcriptLimit: options?.transcriptLimit,
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
