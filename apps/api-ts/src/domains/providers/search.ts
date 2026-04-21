import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SEARCHABLE_PROVIDER_IDS } from "@threadlens/shared-contracts";

import { buildSessionTranscript } from "./transcript.js";
import type {
  ConversationSearchPayload,
  ConversationSearchSessionHitsPayload,
  ConversationSearchSessionResult,
  ConversationSearchResult,
  ProviderId,
  ProviderSessionRow,
  ProviderSessionScan,
  TranscriptPayload,
} from "./types.js";
import {
  buildSearchSnippet,
  buildSearchTokens,
  fallbackDisplayTitle,
  matchesConversationSearch,
  normalizeSearchQuery,
  normalizeSearchText,
} from "./search-helpers.js";
import {
  codexTranscriptSearchRoots,
  providerName,
  providerScanRootSpecs,
} from "./path-safety.js";
import {
  extractCodexThreadIdFromSessionName,
  getCodexThreadTitleMap,
  invalidateCodexThreadTitleMapCache,
} from "./title-detection.js";
import {
  inferSessionId,
  isCopilotGlobalSessionLikeFile,
  isWorkspaceChatSessionPath,
  probeSessionFile,
} from "./probe.js";
import {
  providerStatus,
} from "./matrix.js";
import {
  nowIsoUtc,
  walkFilesByExt,
} from "../../lib/utils.js";

const PROVIDER_SCAN_CACHE_TTL_MS = 60_000;
const PROVIDER_MANIFEST_CACHE_TTL_MS = 5 * 60_000;
const OPENABLE_THREAD_IDS_CACHE_TTL_MS = 15_000;
const CONVERSATION_SEARCH_RESPONSE_CACHE_TTL_MS = 15_000;
const DEFAULT_CONVERSATION_SEARCH_PROVIDERS: ProviderId[] = [...SEARCHABLE_PROVIDER_IDS];
const DEFAULT_CONVERSATION_SEARCH_LIMIT = 40;
const MAX_CONVERSATION_SEARCH_LIMIT = 200;
const DEFAULT_CONVERSATION_SEARCH_TRANSCRIPT_LIMIT = 10_000;
const MAX_CONVERSATION_SEARCH_SCAN_LIMIT = 1_200;
const SEARCH_TRANSCRIPT_CONCURRENCY = 4;
const CONVERSATION_SEARCH_SCAN_CONCURRENCY = 8;
const SEARCH_TRANSCRIPT_CACHE_MAX_ENTRIES = 2_000;
const DEFAULT_CONVERSATION_SEARCH_SCAN_MULTIPLIER = 4;
const DEFAULT_CONVERSATION_SEARCH_SCAN_FLOOR = 160;
const PROVIDER_SCAN_FILE_STAT_CONCURRENCY = 32;
const RAW_CONVERSATION_FILE_MAX_MATCHES = 10_000;
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

type ProviderSessionCandidate = {
  source: string;
  file_path: string;
  size_bytes: number;
  mtime: string;
  mtime_ms: number;
};

type ProviderSessionManifest = {
  provider: ProviderId;
  name: string;
  root_exists: boolean;
  candidates: ProviderSessionCandidate[];
  total_bytes: number;
};

type ProviderManifestCacheEntry = {
  expires_at: number;
  manifest: ProviderSessionManifest;
};

type PersistedProviderManifestCacheEntry = {
  expires_at: number;
  manifest: ProviderSessionManifest;
};

type ConversationSearchResponseCacheEntry = {
  expires_at: number;
  payload: ConversationSearchPayload;
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

type SearchMatchMeta = {
  exactPhrase: boolean;
};

type SearchSessionAccumulator = {
  session: ConversationSearchSessionResult;
  exact_phrase_count: number;
  seen_hits: Set<string>;
};

type RawConversationFileMatch = {
  snippets: string[];
  match_count: number;
  has_more_hits: boolean;
  exact_phrase_count: number;
};

type RawConversationFileSearchLoader = (
  rows: ProviderSessionRow[],
  q: string,
  options?: {
    previewHitsPerSession?: number;
    maxHitsPerSession?: number;
    signal?: AbortSignal;
  },
) => Promise<Map<string, RawConversationFileMatch>>;

const RAW_CONVERSATION_FILE_EXT_PATTERN = /\.(jsonl|json|md|txt|data)$/i;
const RAW_FILE_SEARCH_CHUNK_SIZE = 160;
const EMPTY_PROVIDER_SESSION_PROBE = {
  ok: true,
  format: "unknown" as const,
  error: null,
  detected_title: "",
  title_source: null,
};

function providerSessionSourcePriority(source: string): number {
  const normalized = normalizeSearchText(source).toLowerCase();
  if (normalized === "sessions") return 500;
  if (normalized === "projects") return 480;
  if (normalized === "transcripts") return 470;
  if (normalized === "history") return 460;
  if (normalized === "tmp") return 450;
  if (normalized.includes("workspace")) return 440;
  if (normalized.includes("global")) return 430;
  if (normalized.includes("cleanup_backups")) return 100;
  return 300;
}

function searchLogicalSessionKey(row: ProviderSessionRow): string {
  const inferred = row.session_id || inferSessionId(row.file_path) || path.resolve(row.file_path);
  return `${row.provider}:${inferred}`;
}

function dedupeConversationSearchRows(rows: ProviderSessionRow[]): ProviderSessionRow[] {
  const uniqueRows = new Map<string, ProviderSessionRow>();
  for (const row of rows) {
    const key = searchLogicalSessionKey(row);
    const existing = uniqueRows.get(key);
    if (!existing) {
      uniqueRows.set(key, row);
      continue;
    }
    const existingPriority = providerSessionSourcePriority(existing.source);
    const nextPriority = providerSessionSourcePriority(row.source);
    if (nextPriority > existingPriority) {
      uniqueRows.set(key, row);
      continue;
    }
    if (
      nextPriority === existingPriority &&
      Date.parse(String(row.mtime || "")) > Date.parse(String(existing.mtime || ""))
    ) {
      uniqueRows.set(key, row);
    }
  }
  return [...uniqueRows.values()];
}

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
const providerManifestCache = new Map<ProviderId, ProviderManifestCacheEntry>();
const providerManifestInflight = new Map<ProviderId, Promise<ProviderSessionManifest>>();
const invalidatedProviderManifests = new Set<ProviderId>();
const providerSearchGeneration = new Map<ProviderId, number>();
const conversationSearchResponseCache = new Map<string, ConversationSearchResponseCacheEntry>();
const transcriptSearchCache = new Map<string, TranscriptSearchCacheEntry>();
let openableThreadIdsCache:
  | {
      expires_at: number;
      ids: Set<string>;
    }
  | null = null;

function createAbortError(): Error {
  const error = new Error("conversation-search-aborted");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
}

function awaitAbortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(createAbortError());
    };
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function getProviderSearchGeneration(provider: ProviderId): number {
  return providerSearchGeneration.get(provider) ?? 0;
}

function bumpProviderSearchGeneration(provider: ProviderId): number {
  const next = getProviderSearchGeneration(provider) + 1;
  providerSearchGeneration.set(provider, next);
  return next;
}

function resolveSearchCacheDirectory(): string {
  const override = String(process.env.THREADLENS_SEARCH_CACHE_DIR || "").trim();
  return override || path.join(os.tmpdir(), "threadlens-search-cache");
}

function providerManifestCacheFilePath(provider: ProviderId): string {
  const version = createHash("sha1").update(provider).digest("hex").slice(0, 8);
  return path.join(resolveSearchCacheDirectory(), `manifest-${provider}-${version}.json`);
}

async function readPersistedProviderManifest(
  provider: ProviderId,
): Promise<PersistedProviderManifestCacheEntry | null> {
  try {
    const raw = await readFile(providerManifestCacheFilePath(provider), "utf8");
    const parsed = JSON.parse(raw) as PersistedProviderManifestCacheEntry;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.manifest || !Array.isArray(parsed.manifest.candidates)) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writePersistedProviderManifest(
  provider: ProviderId,
  entry: PersistedProviderManifestCacheEntry,
): Promise<void> {
  const filePath = providerManifestCacheFilePath(provider);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(entry), "utf8");
}

async function deletePersistedProviderManifest(provider: ProviderId): Promise<void> {
  await rm(providerManifestCacheFilePath(provider), { force: true });
}
let openableThreadIdsInflight: Promise<Set<string>> | null = null;

export function invalidateProviderSearchCaches(provider: ProviderId) {
  bumpProviderSearchGeneration(provider);
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
  providerManifestCache.delete(provider);
  providerManifestInflight.delete(provider);
  invalidatedProviderManifests.add(provider);
  conversationSearchResponseCache.clear();
  void deletePersistedProviderManifest(provider);
}

function providerScanCacheKey(provider: ProviderId, limit: number): string {
  return `${provider}:${limit}`;
}

function transcriptSearchCacheKey(row: ProviderSessionRow): string {
  return `${row.provider}:${path.resolve(row.file_path)}`;
}

function conversationSearchResponseCacheKey(options: {
  q: string;
  providers: ProviderId[];
  pageSize: number;
  cursor?: string;
  transcriptLimit?: number;
  previewHitsPerSession?: number;
  sessionLimitPerProvider?: number;
}): string {
  return [
    options.q,
    [...options.providers].sort().join(","),
    options.pageSize,
    options.cursor || "",
    options.transcriptLimit || "",
    options.previewHitsPerSession || "",
    options.sessionLimitPerProvider || "",
  ].join("::");
}

function shouldIncludeProviderSessionFile(
  provider: ProviderId,
  source: string,
  filePath: string,
): boolean {
  const baseName = path.basename(filePath);
  if (source === "cleanup_backups" && baseName === "_manifest.json") {
    return false;
  }
  if (
    provider === "copilot" &&
    (source === "vscode_workspace_chats" || source === "cursor_workspace_chats")
  ) {
    return isWorkspaceChatSessionPath(filePath);
  }
  if (
    provider === "copilot" &&
    (source === "vscode_global" || source === "cursor_global")
  ) {
    return isCopilotGlobalSessionLikeFile(filePath);
  }
  return true;
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
    if (transcript) {
      transcriptSearchCache.set(key, {
        mtime: row.mtime,
        transcript,
      });
      trimTranscriptSearchCache();
    }
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

function decodeConversationSearchCursor(cursor?: string): number {
  const offset = Math.max(0, Math.floor(Number(cursor) || 0));
  return Number.isFinite(offset) ? offset : 0;
}

function encodeConversationSearchCursor(offset: number): string {
  return String(Math.max(0, Math.floor(offset)));
}

function isExactPhraseSearchMatch(
  text: string,
  normalizedQuery: string,
): boolean {
  if (!normalizedQuery) return false;
  return normalizeSearchQuery(text).includes(normalizedQuery);
}

function createSessionAccumulator(
  row: ProviderSessionRow,
  identity: ReturnType<typeof buildSearchIdentity>,
): SearchSessionAccumulator {
  return {
    session: {
      provider: row.provider,
      session_id: identity.sessionId,
      ...(identity.threadId ? { thread_id: identity.threadId } : {}),
      title: identity.title,
      ...(row.display_title ? { display_title: row.display_title } : {}),
      file_path: row.file_path,
      source: row.source,
      mtime: row.mtime,
      match_count: 0,
      title_match_count: 0,
      best_match_kind: "message",
      preview_matches: [],
      has_more_hits: false,
    },
    exact_phrase_count: 0,
    seen_hits: new Set<string>(),
  };
}

function addSessionSearchHit(
  session: SearchSessionAccumulator,
  result: ConversationSearchResult,
  meta: SearchMatchMeta,
  previewLimit: number,
): void {
  const dedupeKey = conversationSearchResultDedupKey(result);
  if (session.seen_hits.has(dedupeKey)) return;
  session.seen_hits.add(dedupeKey);
  session.session.match_count += 1;
  if (result.match_kind === "title") {
    session.session.title_match_count += 1;
    session.session.best_match_kind = "title";
  }
  if (meta.exactPhrase) {
    session.exact_phrase_count += 1;
  }
  if (session.session.preview_matches.length < previewLimit) {
    session.session.preview_matches.push(result);
  }
  session.session.has_more_hits =
    session.session.match_count > session.session.preview_matches.length;
}

function compareConversationSearchSessions(
  left: SearchSessionAccumulator,
  right: SearchSessionAccumulator,
): number {
  const leftTitle = left.session.title_match_count > 0 ? 1 : 0;
  const rightTitle = right.session.title_match_count > 0 ? 1 : 0;
  if (leftTitle !== rightTitle) return rightTitle - leftTitle;
  if (left.exact_phrase_count !== right.exact_phrase_count) {
    return right.exact_phrase_count - left.exact_phrase_count;
  }
  if (left.session.match_count !== right.session.match_count) {
    return right.session.match_count - left.session.match_count;
  }
  return (
    Date.parse(String(right.session.mtime || "")) -
    Date.parse(String(left.session.mtime || ""))
  );
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

async function buildProviderSessionManifest(
  provider: ProviderId,
  options?: { signal?: AbortSignal },
): Promise<ProviderSessionManifest> {
  throwIfAborted(options?.signal);
  const roots = await providerScanRootSpecs(provider);
  throwIfAborted(options?.signal);
  const rootExists =
    provider === "chatgpt"
      ? roots.length > 0
      : (await Promise.all(roots.map((r) => walkRootExists(r.root)))).some(Boolean);

  const candidates: ProviderSessionCandidate[] = [];

  const rootFiles = await Promise.all(
    roots.map((spec) => {
      throwIfAborted(options?.signal);
      return walkFilesByExt(spec.root, spec.exts, Number.MAX_SAFE_INTEGER);
    }),
  );

  for (let i = 0; i < roots.length; i += 1) {
    throwIfAborted(options?.signal);
    const spec = roots[i];
    const files = rootFiles[i] ?? [];
    const filteredFiles = files.filter((filePath) =>
      shouldIncludeProviderSessionFile(provider, spec.source, filePath),
    );

    const scannedCandidates = await mapWithConcurrency(
      filteredFiles,
      PROVIDER_SCAN_FILE_STAT_CONCURRENCY,
      async (file) => {
        try {
          throwIfAborted(options?.signal);
          const st = await stat(file);
          throwIfAborted(options?.signal);
          return {
            source: spec.source,
            file_path: file,
            size_bytes: Number(st.size),
            mtime: new Date(Number(st.mtimeMs)).toISOString(),
            mtime_ms: Number(st.mtimeMs),
          };
        } catch {
          return null;
        }
      },
    );
    candidates.push(
      ...scannedCandidates.filter(
        (
          candidate,
        ): candidate is {
          source: string;
          file_path: string;
          size_bytes: number;
          mtime: string;
          mtime_ms: number;
        } => Boolean(candidate),
      ),
    );
  }

  candidates.sort((a, b) => b.mtime_ms - a.mtime_ms);
  return {
    provider,
    name: providerName(provider),
    root_exists: rootExists,
    candidates,
    total_bytes: candidates.reduce(
      (sum, candidate) => sum + Number(candidate.size_bytes || 0),
      0,
    ),
  };
}

async function materializeProviderSessionScan(
  manifest: ProviderSessionManifest,
  limit = 80,
  options?: { maxLimit?: number; signal?: AbortSignal },
): Promise<ProviderSessionScan> {
  throwIfAborted(options?.signal);
  const startedAt = Date.now();
  const hardLimit = Math.max(
    1,
    Number(options?.maxLimit) || MAX_CONVERSATION_SEARCH_SCAN_LIMIT,
  );
  const safeLimit = Math.max(1, Math.min(hardLimit, Number(limit) || 80));
  const selected = manifest.candidates.slice(0, safeLimit);
  const codexTitleMap =
    manifest.provider === "codex" ? await getCodexThreadTitleMap() : null;
  throwIfAborted(options?.signal);
  const rows: ProviderSessionRow[] = await Promise.all(
    selected.map((candidate) =>
      materializeProviderSessionRow(manifest, candidate, codexTitleMap, {
        signal: options?.signal,
      }),
    ),
  );

  return {
    provider: manifest.provider,
    name: manifest.name,
    status: providerStatus(manifest.root_exists, manifest.candidates.length),
    rows,
    scanned: rows.length,
    truncated: manifest.candidates.length > safeLimit,
    scan_ms: Math.max(0, Date.now() - startedAt),
    total_bytes: manifest.total_bytes,
  };
}

function materializeProviderSessionMetadataScan(
  manifest: ProviderSessionManifest,
  limit = 80,
  options?: { maxLimit?: number },
): ProviderSessionScan {
  const startedAt = Date.now();
  const hardLimit = Math.max(
    1,
    Number(options?.maxLimit) || MAX_CONVERSATION_SEARCH_SCAN_LIMIT,
  );
  const safeLimit = Math.max(1, Math.min(hardLimit, Number(limit) || 80));
  const rows: ProviderSessionRow[] = manifest.candidates.slice(0, safeLimit).map((candidate) => ({
    provider: manifest.provider,
    source: candidate.source,
    session_id: inferSessionId(candidate.file_path),
    display_title: "",
    file_path: candidate.file_path,
    size_bytes: candidate.size_bytes,
    mtime: candidate.mtime,
    probe: EMPTY_PROVIDER_SESSION_PROBE,
  }));

  return {
    provider: manifest.provider,
    name: manifest.name,
    status: providerStatus(manifest.root_exists, manifest.candidates.length),
    rows,
    scanned: rows.length,
    truncated: manifest.candidates.length > safeLimit,
    scan_ms: Math.max(0, Date.now() - startedAt),
    total_bytes: manifest.total_bytes,
  };
}

async function materializeProviderSessionRow(
  manifest: ProviderSessionManifest,
  candidate: ProviderSessionCandidate,
  codexTitleMap?: Map<string, string> | null,
  options?: { signal?: AbortSignal },
): Promise<ProviderSessionRow> {
  throwIfAborted(options?.signal);
  const rawSessionId = inferSessionId(candidate.file_path);
  const codexThreadId =
    manifest.provider === "codex"
      ? extractCodexThreadIdFromSessionName(rawSessionId)
      : "";
  const sessionId = codexThreadId || rawSessionId;
  const probe = await probeSessionFile(candidate.file_path);
  throwIfAborted(options?.signal);
  return {
    provider: manifest.provider,
    source: candidate.source,
    session_id: sessionId,
    display_title:
      (codexTitleMap && codexThreadId ? codexTitleMap.get(codexThreadId) : "") ||
      probe.detected_title ||
      fallbackDisplayTitle(manifest.provider, sessionId, candidate.source),
    file_path: candidate.file_path,
    size_bytes: candidate.size_bytes,
    mtime: candidate.mtime,
    probe,
  };
}

function dedupeProviderSessionCandidates(
  provider: ProviderId,
  candidates: ProviderSessionCandidate[],
): ProviderSessionCandidate[] {
  const uniqueCandidates = new Map<string, ProviderSessionCandidate>();
  for (const candidate of candidates) {
    const key = `${provider}:${inferSessionId(candidate.file_path) || path.resolve(candidate.file_path)}`;
    const existing = uniqueCandidates.get(key);
    if (!existing) {
      uniqueCandidates.set(key, candidate);
      continue;
    }
    const existingPriority = providerSessionSourcePriority(existing.source);
    const nextPriority = providerSessionSourcePriority(candidate.source);
    if (nextPriority > existingPriority || (nextPriority === existingPriority && candidate.mtime_ms > existing.mtime_ms)) {
      uniqueCandidates.set(key, candidate);
    }
  }
  return [...uniqueCandidates.values()];
}

function selectProviderSessionManifestCandidate(
  manifest: ProviderSessionManifest,
  options: { sessionId: string; filePath?: string },
): ProviderSessionCandidate | null {
  const normalizedFilePath = options.filePath ? path.resolve(options.filePath) : "";
  const dedupedCandidates = dedupeProviderSessionCandidates(manifest.provider, manifest.candidates);
  const matchesRequestedSession = (candidate: ProviderSessionCandidate) =>
    inferSessionId(candidate.file_path) === options.sessionId;
  const filePathMatch = normalizedFilePath
    ? dedupedCandidates.find((candidate) => path.resolve(candidate.file_path) === normalizedFilePath)
    : null;
  if (filePathMatch && matchesRequestedSession(filePathMatch)) {
    return filePathMatch;
  }
  return dedupedCandidates.find(matchesRequestedSession) ?? null;
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
  options?: { forceRefresh?: boolean; signal?: AbortSignal },
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
  const generation = getProviderSearchGeneration(provider);

  const inflight = providerScanInflight.get(key);
  if (inflight) return awaitAbortable(inflight, options?.signal);

  const task = getProviderSessionManifest(provider, forceRefresh, options?.signal)
    .then((manifest) =>
      materializeProviderSessionScan(manifest, safeLimit, {
        signal: options?.signal,
      }),
    )
    .then((scan) => {
      if (getProviderSearchGeneration(provider) === generation) {
        providerScanCache.set(key, {
          expires_at: Date.now() + PROVIDER_SCAN_CACHE_TTL_MS,
          scan,
        });
      }
      return scan;
    })
    .finally(() => {
      if (providerScanInflight.get(key) === task) {
        providerScanInflight.delete(key);
      }
    });

  providerScanInflight.set(key, task);
  return awaitAbortable(task, options?.signal);
}

async function getProviderSessionManifest(
  provider: ProviderId,
  forceRefresh = false,
  signal?: AbortSignal,
): Promise<ProviderSessionManifest> {
  const now = Date.now();
  const skipPersistedManifest = forceRefresh || invalidatedProviderManifests.has(provider);
  const generation = getProviderSearchGeneration(provider);
  throwIfAborted(signal);
  if (!skipPersistedManifest) {
    const cached = providerManifestCache.get(provider);
    if (cached && cached.expires_at > now) return cached.manifest;
    const persisted = await readPersistedProviderManifest(provider);
    if (persisted && persisted.expires_at > now) {
      providerManifestCache.set(provider, persisted);
      return persisted.manifest;
    }
  }

  const inflight = providerManifestInflight.get(provider);
  if (inflight) return awaitAbortable(inflight, signal);

  const task = buildProviderSessionManifest(provider, { signal })
    .then((manifest) => {
      throwIfAborted(signal);
      return manifest;
    })
    .then((manifest) => {
      if (getProviderSearchGeneration(provider) !== generation) {
        return manifest;
      }
      const entry = {
        expires_at: Date.now() + PROVIDER_MANIFEST_CACHE_TTL_MS,
        manifest,
      };
      providerManifestCache.set(provider, entry);
      invalidatedProviderManifests.delete(provider);
      return writePersistedProviderManifest(provider, entry)
        .catch(() => undefined)
        .then(() => manifest);
    })
    .finally(() => {
      if (providerManifestInflight.get(provider) === task) {
        providerManifestInflight.delete(provider);
      }
    });

  providerManifestInflight.set(provider, task);
  return awaitAbortable(task, signal);
}

export async function primeConversationSearchCaches(
  providers: ProviderId[] = defaultConversationSearchProviders(),
): Promise<void> {
  const targets = Array.from(new Set(providers));
  await Promise.allSettled([
    ...targets.map((provider) =>
      getProviderSessionManifest(provider, false),
    ),
    resolveOpenableThreadIds(false),
  ]);
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
): { result: ConversationSearchResult; meta: SearchMatchMeta } | null {
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
      result: {
        ...buildBaseSearchResult(row, identity),
        ...(row.display_title ? { display_title: row.display_title } : {}),
        source: row.source,
        match_kind: "title",
        snippet: buildSearchSnippet(candidate, normalizedQuery, tokens, 140),
      },
      meta: {
        exactPhrase: isExactPhraseSearchMatch(candidate, normalizedQuery),
      },
    };
  }

  return null;
}

function isRawConversationFileSearchEligible(filePath: string): boolean {
  return RAW_CONVERSATION_FILE_EXT_PATTERN.test(filePath);
}

function buildRipgrepPattern(query: string): string | null {
  const trimmedQuery = normalizeSearchText(query);
  const normalizedQuery = normalizeSearchQuery(trimmedQuery);
  const tokens = buildSearchTokens(trimmedQuery);
  if (!normalizedQuery && !tokens.length) return null;
  if (normalizedQuery && tokens.length <= 1) {
    return normalizedQuery;
  }
  if (tokens.length > 0) {
    return tokens[0];
  }
  return normalizedQuery;
}

async function searchConversationFilesWithRipgrep(
  rows: ProviderSessionRow[],
  q: string,
  options?: {
    previewHitsPerSession?: number;
    maxHitsPerSession?: number;
    signal?: AbortSignal;
  },
): Promise<Map<string, RawConversationFileMatch>> {
  const pattern = buildRipgrepPattern(q);
  if (!pattern) return new Map();
  const previewLimit = Math.max(
    1,
    Math.min(
      RAW_CONVERSATION_FILE_MAX_MATCHES,
      Number(options?.previewHitsPerSession) || 3,
    ),
  );
  const maxHitsPerSession = Math.max(
    previewLimit,
    Math.min(
      RAW_CONVERSATION_FILE_MAX_MATCHES,
      Number(options?.maxHitsPerSession) || previewLimit,
    ),
  );
  const maxPerFile = maxHitsPerSession + 1;
  const normalizedQuery = normalizeSearchQuery(q);
  const tokens = buildSearchTokens(q);
  const textRows = rows.filter((row) => isRawConversationFileSearchEligible(row.file_path));
  if (!textRows.length) return new Map();

  const files = textRows.map((row) => row.file_path);
  const matches = new Map<string, RawConversationFileMatch>();
  for (let index = 0; index < files.length; index += RAW_FILE_SEARCH_CHUNK_SIZE) {
    throwIfAborted(options?.signal);
    const chunk = files.slice(index, index + RAW_FILE_SEARCH_CHUNK_SIZE);
    try {
      const stdout = await new Promise<string>((resolve, reject) => {
        const child = spawn(
          "rg",
          [
            "--json",
            "-F",
            "-i",
            "-m",
            String(maxPerFile),
            pattern,
            ...chunk,
          ],
          {
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let out = "";
        let err = "";
        const abortHandler = () => {
          child.kill("SIGTERM");
          reject(createAbortError());
        };
        options?.signal?.addEventListener("abort", abortHandler, { once: true });
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (data) => {
          out += data;
        });
        child.stderr.on("data", (data) => {
          err += data;
        });
        child.on("error", (error) => {
          options?.signal?.removeEventListener("abort", abortHandler);
          reject(error);
        });
        child.on("close", (code) => {
          options?.signal?.removeEventListener("abort", abortHandler);
          if (code === 0 || code === 1) {
            resolve(out);
            return;
          }
          reject(new Error(err || `rg exited with code ${String(code)}`));
        });
      });

      for (const line of stdout.split(/\r?\n/)) {
        throwIfAborted(options?.signal);
        if (!line.trim()) continue;
        let event: unknown;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (!event || typeof event !== "object") continue;
        const parsed = event as {
          type?: string;
          data?: {
            path?: { text?: string };
            lines?: { text?: string };
          };
        };
        if (parsed.type !== "match") continue;
        const filePath = parsed.data?.path?.text;
        const rawLine = parsed.data?.lines?.text;
        if (!filePath || !rawLine) continue;
        if (!matchesConversationSearch(rawLine, normalizedQuery, tokens)) continue;
        const current = matches.get(filePath) ?? {
          snippets: [],
          match_count: 0,
          has_more_hits: false,
          exact_phrase_count: 0,
        };
        current.match_count += 1;
        if (isExactPhraseSearchMatch(rawLine, normalizedQuery)) {
          current.exact_phrase_count += 1;
        }
        if (current.snippets.length < maxHitsPerSession) {
          const snippet = buildSearchSnippet(rawLine, normalizedQuery, tokens);
          if (snippet && !current.snippets.includes(snippet)) {
            current.snippets.push(snippet);
          }
        }
        if (current.match_count > maxHitsPerSession) {
          current.has_more_hits = true;
        }
        matches.set(filePath, current);
      }
    } catch (error) {
      if ((error as Error)?.name === "AbortError") throw error;
      const failure = error as { code?: number };
      if (failure.code === 1) continue;
      throw error;
    }
  }

  return matches;
}

async function collectConversationSessionMatches(
  row: ProviderSessionRow,
  q: string,
  options?: {
    transcriptLoader?: CachedConversationTranscriptLoader;
    transcriptLimit?: number;
    openableThreadIds?: Set<string>;
    previewHitsPerSession?: number;
    exhaustiveHits?: boolean;
    rawFileMatch?: RawConversationFileMatch | null;
    rawFileSearchComplete?: boolean;
    signal?: AbortSignal;
  },
): Promise<SearchSessionAccumulator | null> {
  throwIfAborted(options?.signal);
  const trimmedQuery = normalizeSearchText(q);
  const normalizedQuery = normalizeSearchQuery(trimmedQuery);
  const tokens = buildSearchTokens(trimmedQuery);
  const transcriptLimit = Math.max(
    100,
    Math.min(
      DEFAULT_CONVERSATION_SEARCH_TRANSCRIPT_LIMIT,
      Number(options?.transcriptLimit) || DEFAULT_CONVERSATION_SEARCH_TRANSCRIPT_LIMIT,
    ),
  );
  const metadataOnlyQuery = isMetadataOnlyConversationQuery(trimmedQuery);
  const transcriptLoader =
    options?.transcriptLoader ??
    createCachedConversationTranscriptLoader((provider: ProviderId, filePath: string) =>
      buildSessionTranscript(provider, filePath, transcriptLimit),
    );
  const identity = buildSearchIdentity(row, options?.openableThreadIds);
  const exhaustiveHits = Boolean(options?.exhaustiveHits);
  const previewHitsPerSession = Math.max(
    1,
    Math.min(
      exhaustiveHits ? RAW_CONVERSATION_FILE_MAX_MATCHES : 20,
      Number(options?.previewHitsPerSession) || 3,
    ),
  );
  const accumulator = createSessionAccumulator(row, identity);
  const metadataResult = buildMetadataSearchResult(
    row,
    identity,
    normalizedQuery,
    tokens,
  );

  if (metadataResult) {
    addSessionSearchHit(
      accumulator,
      metadataResult.result,
      metadataResult.meta,
      previewHitsPerSession,
    );
  }

  if (options?.rawFileMatch) {
    for (const snippet of options.rawFileMatch.snippets) {
      addSessionSearchHit(
        accumulator,
        {
          ...buildBaseSearchResult(row, identity),
          ...(row.display_title ? { display_title: row.display_title } : {}),
          source: row.source,
          match_kind: "message",
          snippet,
        },
        {
          exactPhrase: isExactPhraseSearchMatch(snippet, normalizedQuery),
        },
        previewHitsPerSession,
      );
    }
    accumulator.session.match_count = Math.max(
      accumulator.session.match_count,
      options.rawFileMatch.match_count,
    );
    accumulator.session.has_more_hits =
      options.rawFileMatch.has_more_hits ||
      accumulator.session.match_count > accumulator.session.preview_matches.length;
    accumulator.exact_phrase_count = Math.max(
      accumulator.exact_phrase_count,
      options.rawFileMatch.exact_phrase_count,
    );
    return accumulator.session.match_count > 0 ? accumulator : null;
  }

  if (options?.rawFileSearchComplete && isRawConversationFileSearchEligible(row.file_path)) {
    return accumulator.session.match_count > 0 ? accumulator : null;
  }

  if (!metadataOnlyQuery) {
    throwIfAborted(options?.signal);
    const transcript = await transcriptLoader(row);
    if (transcript?.messages?.length) {
      for (let i = 0; i < transcript.messages.length; i += 1) {
        throwIfAborted(options?.signal);
        const message = transcript.messages[i];
        if (message.role === "system" || message.role === "tool") continue;
        if (isPolicyInjectionMessage(message.text)) continue;
        if (!matchesConversationSearch(message.text, normalizedQuery, tokens)) continue;
        addSessionSearchHit(
          accumulator,
          {
            ...buildBaseSearchResult(row, identity),
            ...(row.display_title ? { display_title: row.display_title } : {}),
            source: row.source,
            match_kind: "message",
            snippet: buildSearchSnippet(message.text, normalizedQuery, tokens),
            role: message.role,
          },
          {
            exactPhrase: isExactPhraseSearchMatch(message.text, normalizedQuery),
          },
          previewHitsPerSession,
        );
        if (!exhaustiveHits && accumulator.session.match_count >= previewHitsPerSession + 1) {
          break;
        }
      }
    }
  }

  if (accumulator.session.match_count === 0) return null;
  accumulator.session.has_more_hits =
    accumulator.session.match_count > accumulator.session.preview_matches.length;
  return accumulator;
}

export async function searchConversationSessions(
  rows: ProviderSessionRow[],
  q: string,
  options?: {
    pageSize?: number;
    cursor?: string;
    transcriptLoader?: ConversationTranscriptLoader;
    transcriptLimit?: number;
    openableThreadIds?: Set<string>;
    previewHitsPerSession?: number;
    rawFileSearchLoader?: RawConversationFileSearchLoader;
    signal?: AbortSignal;
  },
): Promise<{
  searched_sessions: number;
  available_sessions: number;
  truncated: boolean;
  total_matching_sessions: number | null;
  total_matching_hits: number | null;
  has_more: boolean;
  next_cursor: string | null;
  sessions: ConversationSearchSessionResult[];
  results: ConversationSearchResult[];
}> {
  const pageSize = Math.max(1, Math.min(200, Number(options?.pageSize) || 40));
  const offset = decodeConversationSearchCursor(options?.cursor);
  const metadataOnlyQuery = isMetadataOnlyConversationQuery(q);
  const transcriptLimit = Math.max(
    100,
    Math.min(
      DEFAULT_CONVERSATION_SEARCH_TRANSCRIPT_LIMIT,
      Number(options?.transcriptLimit) || DEFAULT_CONVERSATION_SEARCH_TRANSCRIPT_LIMIT,
    ),
  );
  const cachedTranscriptLoader =
    options?.transcriptLoader
      ? createCachedConversationTranscriptLoader(options.transcriptLoader)
      : undefined;
  const seenPaths = new Set<string>();
  const sortedRows = dedupeConversationSearchRows(
    [...rows]
      .sort(
        (a, b) =>
          Date.parse(String(b.mtime || "")) - Date.parse(String(a.mtime || "")),
      )
      .filter((row) => {
        const key = `${row.provider}:${path.resolve(row.file_path)}`;
        if (seenPaths.has(key)) return false;
        seenPaths.add(key);
        return true;
      }),
  ).sort(
    (a, b) =>
      Date.parse(String(b.mtime || "")) - Date.parse(String(a.mtime || "")),
  );

  const sessionMatches: SearchSessionAccumulator[] = [];
  let scannedRows = 0;
  let rawFileMatches = new Map<string, RawConversationFileMatch>();
  let rawFileSearchComplete = false;
  const shouldUseRawFileSearch =
    !metadataOnlyQuery && (Boolean(options?.rawFileSearchLoader) || !options?.transcriptLoader);
  if (shouldUseRawFileSearch) {
    try {
      rawFileMatches = await (
        options?.rawFileSearchLoader ?? searchConversationFilesWithRipgrep
      )(sortedRows, q, {
        previewHitsPerSession: options?.previewHitsPerSession,
        signal: options?.signal,
      });
      rawFileSearchComplete = true;
    } catch (error) {
      if ((error as Error)?.name === "AbortError") throw error;
      rawFileMatches = new Map();
      rawFileSearchComplete = false;
    }
  }

  for (
    let index = 0;
    index < sortedRows.length;
    index += CONVERSATION_SEARCH_SCAN_CONCURRENCY
  ) {
    throwIfAborted(options?.signal);
    const batchRows = sortedRows.slice(
      index,
      index + CONVERSATION_SEARCH_SCAN_CONCURRENCY,
    );
    const batchMatches = await mapWithConcurrency(
      batchRows,
      CONVERSATION_SEARCH_SCAN_CONCURRENCY,
      async (row) =>
        collectConversationSessionMatches(row, q, {
          transcriptLoader: cachedTranscriptLoader,
          transcriptLimit,
          openableThreadIds: options?.openableThreadIds,
          previewHitsPerSession: options?.previewHitsPerSession,
          rawFileMatch: rawFileMatches.get(row.file_path) ?? null,
          rawFileSearchComplete,
          signal: options?.signal,
        }),
    );

    for (let batchOffset = 0; batchOffset < batchMatches.length; batchOffset += 1) {
      scannedRows = index + batchOffset + 1;
      const session = batchMatches[batchOffset];
      if (!session) continue;
      sessionMatches.push(session);
    }
  }

  const orderedMatches = sessionMatches.sort(compareConversationSearchSessions);
  const totalMatchingSessions = orderedMatches.length;
  const hasMore = offset + pageSize < totalMatchingSessions;
  const pageSessions = orderedMatches
    .slice(offset, offset + pageSize)
    .sort(compareConversationSearchSessions)
    .map((item) => item.session);
  const nextCursor = hasMore
    ? encodeConversationSearchCursor(offset + pageSize)
    : null;
  const totalMatchingHits = null;

  return {
    searched_sessions: scannedRows,
    available_sessions: sortedRows.length,
    truncated: scannedRows < sortedRows.length,
    total_matching_sessions: totalMatchingSessions,
    total_matching_hits: totalMatchingHits,
    has_more: hasMore,
    next_cursor: nextCursor,
    sessions: pageSessions,
    results: pageSessions.flatMap((session) => session.preview_matches),
  };
}

export async function searchConversationSessionHits(
  row: ProviderSessionRow,
  q: string,
  options?: {
    pageSize?: number;
    cursor?: string;
    transcriptLoader?: ConversationTranscriptLoader;
    transcriptLimit?: number;
    openableThreadIds?: Set<string>;
    rawFileSearchLoader?: RawConversationFileSearchLoader;
    signal?: AbortSignal;
  },
): Promise<ConversationSearchSessionHitsPayload> {
  throwIfAborted(options?.signal);
  const pageSize = Math.max(1, Math.min(200, Number(options?.pageSize) || 40));
  const offset = decodeConversationSearchCursor(options?.cursor);
  const requestedHitWindow = Math.max(
    pageSize,
    Math.min(RAW_CONVERSATION_FILE_MAX_MATCHES, offset + pageSize + 1),
  );
  const transcriptLimit = Math.max(
    100,
    Math.min(
      DEFAULT_CONVERSATION_SEARCH_TRANSCRIPT_LIMIT,
      Number(options?.transcriptLimit) || DEFAULT_CONVERSATION_SEARCH_TRANSCRIPT_LIMIT,
    ),
  );
  const cachedTranscriptLoader =
    options?.transcriptLoader
      ? createCachedConversationTranscriptLoader(options.transcriptLoader)
      : undefined;
  let rawFileMatch: RawConversationFileMatch | null = null;
  let rawFileSearchComplete = false;
  const shouldUseRawFileSearch =
    Boolean(options?.rawFileSearchLoader) || !options?.transcriptLoader;
  if (shouldUseRawFileSearch) {
    try {
      rawFileMatch =
        (
          await (options?.rawFileSearchLoader ?? searchConversationFilesWithRipgrep)([row], q, {
            previewHitsPerSession: requestedHitWindow,
            maxHitsPerSession: requestedHitWindow,
            signal: options?.signal,
          })
        ).get(row.file_path) ?? null;
      rawFileSearchComplete = true;
    } catch (error) {
      if ((error as Error)?.name === "AbortError") throw error;
      rawFileMatch = null;
      rawFileSearchComplete = false;
    }
  }
  const canSatisfyCursorFromRawFile =
    !rawFileMatch ||
    offset < rawFileMatch.snippets.length ||
    !rawFileMatch.has_more_hits;
  const session = await collectConversationSessionMatches(row, q, {
    transcriptLoader: cachedTranscriptLoader,
    transcriptLimit,
    openableThreadIds: options?.openableThreadIds,
    previewHitsPerSession: requestedHitWindow,
    exhaustiveHits: true,
    rawFileMatch: canSatisfyCursorFromRawFile ? rawFileMatch : null,
    rawFileSearchComplete: canSatisfyCursorFromRawFile ? rawFileSearchComplete : false,
    signal: options?.signal,
  });

  const hits = session?.session.preview_matches ?? [];
  const totalHits = Math.max(hits.length, session?.session.match_count ?? 0);
  const hasMore = offset + pageSize < totalHits;
  const nextCursor = hasMore
    ? encodeConversationSearchCursor(offset + pageSize)
    : null;

  return {
    generated_at: nowIsoUtc(),
    q: normalizeSearchText(q),
    provider: row.provider,
    session_id: row.session_id,
    file_path: row.file_path,
    page_size: pageSize,
    total_hits: totalHits,
    has_more: hasMore,
    next_cursor: nextCursor,
    hits: hits.slice(offset, offset + pageSize),
  };
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
      metadataResults.push(metadataResult.result);
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
  const now = Date.now();
  if (!forceRefresh && openableThreadIdsCache && openableThreadIdsCache.expires_at > now) {
    return new Set(openableThreadIdsCache.ids);
  }
  if (!forceRefresh && openableThreadIdsInflight) {
    return openableThreadIdsInflight.then((ids) => new Set(ids));
  }

  const loadIds = (async () => {
    const { getThreadsTs } = await import("../threads/query.js");
    const threads = await getThreadsTs({
      offset: "0",
      limit: "240",
      q: "",
      sort: "updated_desc",
      ...(forceRefresh ? { refresh: "1" } : {}),
    });
    const ids = new Set(
      (threads.rows ?? [])
        .map((row) => String(row.thread_id || "").trim())
        .filter(Boolean),
    );
    openableThreadIdsCache = {
      expires_at: Date.now() + OPENABLE_THREAD_IDS_CACHE_TTL_MS,
      ids,
    };
    return ids;
  })();

  if (!forceRefresh) {
    openableThreadIdsInflight = loadIds;
  }

  try {
    return new Set(await loadIds);
  } finally {
    if (openableThreadIdsInflight === loadIds) {
      openableThreadIdsInflight = null;
    }
  }
}

export async function searchLocalConversationsTs(
  q: string,
  options?: {
    providers?: ProviderId[];
    limit?: number;
    pageSize?: number;
    cursor?: string;
    forceRefresh?: boolean;
    transcriptLimit?: number;
    previewHitsPerSession?: number;
    sessionLimitPerProvider?: number;
    signal?: AbortSignal;
  },
): Promise<ConversationSearchPayload> {
  const trimmedQuery = normalizeSearchText(q);
  const metadataOnlyQuery = isMetadataOnlyConversationQuery(trimmedQuery);
  const providers =
    options?.providers?.length ? Array.from(new Set(options.providers)) : defaultConversationSearchProviders();
  const safePageSize = Math.max(
    1,
    Math.min(
      MAX_CONVERSATION_SEARCH_LIMIT,
      Number(options?.pageSize) || Number(options?.limit) || DEFAULT_CONVERSATION_SEARCH_LIMIT,
    ),
  );
  const forceRefresh = Boolean(options?.forceRefresh);
  const cacheKey = conversationSearchResponseCacheKey({
    q: trimmedQuery,
    providers,
    pageSize: safePageSize,
    cursor: options?.cursor,
    transcriptLimit: options?.transcriptLimit,
    previewHitsPerSession: options?.previewHitsPerSession,
    sessionLimitPerProvider: options?.sessionLimitPerProvider,
  });
  if (!forceRefresh) {
    const cached = conversationSearchResponseCache.get(cacheKey);
    if (cached && cached.expires_at > Date.now()) {
      return cached.payload;
    }
  }
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
      : providers.map((provider) => ({
          provider,
          limit: MAX_CONVERSATION_SEARCH_SCAN_LIMIT,
        }));
  const scans = await Promise.all(
    providerBudgets.map(async ({ provider, limit }) => {
      throwIfAborted(options?.signal);
      if (!metadataOnlyQuery) {
        return getProviderSessionScan(provider, limit, {
          forceRefresh,
          signal: options?.signal,
        });
      }
      const manifest = await getProviderSessionManifest(
        provider,
        forceRefresh,
        options?.signal,
      );
      return materializeProviderSessionMetadataScan(manifest, limit);
    }),
  );
  const rows = scans.flatMap((scan) => scan.rows);
  const openableThreadIds = await resolveOpenableThreadIds(forceRefresh);
  const result = await searchConversationSessions(rows, trimmedQuery, {
    pageSize: safePageSize,
    cursor: options?.cursor,
    transcriptLimit: options?.transcriptLimit,
    openableThreadIds,
    previewHitsPerSession: options?.previewHitsPerSession,
    signal: options?.signal,
  });

  const payload = {
    generated_at: nowIsoUtc(),
    q: trimmedQuery,
    providers,
    limit: safePageSize,
    page_size: safePageSize,
    searched_sessions: result.searched_sessions,
    available_sessions: result.available_sessions,
    truncated: scans.some((scan) => scan.truncated) || result.truncated,
    total_matching_sessions: result.total_matching_sessions,
    total_matching_hits: result.total_matching_hits,
    has_more: result.has_more,
    next_cursor: result.next_cursor,
    preview_hits_per_session: Math.max(
      1,
      Math.min(20, Number(options?.previewHitsPerSession) || 3),
    ),
    sessions: result.sessions,
    results: result.results,
  };
  if (!forceRefresh) {
    conversationSearchResponseCache.set(cacheKey, {
      expires_at: Date.now() + CONVERSATION_SEARCH_RESPONSE_CACHE_TTL_MS,
      payload,
    });
  }
  return payload;
}

export async function searchConversationSessionHitsTs(
  q: string,
  options: {
    provider: ProviderId;
    sessionId: string;
    filePath?: string;
    pageSize?: number;
    cursor?: string;
    forceRefresh?: boolean;
    transcriptLimit?: number;
    signal?: AbortSignal;
  },
): Promise<ConversationSearchSessionHitsPayload | null> {
  const forceRefresh = Boolean(options.forceRefresh);
  const manifest = await getProviderSessionManifest(
    options.provider,
    forceRefresh,
    options.signal,
  );
  const candidate = selectProviderSessionManifestCandidate(manifest, {
    sessionId: options.sessionId,
    filePath: options.filePath,
  });
  if (!candidate) return null;
  const codexTitleMap =
    manifest.provider === "codex" ? await getCodexThreadTitleMap() : null;
  const targetRow = await materializeProviderSessionRow(
    manifest,
    candidate,
    codexTitleMap,
    { signal: options.signal },
  );
  if (!targetRow) return null;
  if (!targetRow.probe.ok) return null;
  const openableThreadIds = await resolveOpenableThreadIds(forceRefresh);
  return searchConversationSessionHits(targetRow, q, {
    pageSize: options.pageSize,
    cursor: options.cursor,
    transcriptLimit: options.transcriptLimit,
    openableThreadIds,
    signal: options.signal,
  });
}

export function selectConversationSessionHitsRow(
  rows: ProviderSessionRow[],
  options: { sessionId: string; filePath?: string },
): ProviderSessionRow | null {
  const normalizedFilePath = options.filePath ? path.resolve(options.filePath) : "";
  const dedupedRows = dedupeConversationSearchRows(rows);
  const matchesRequestedSession = (row: ProviderSessionRow) =>
    row.session_id === options.sessionId || inferSessionId(row.file_path) === options.sessionId;
  const filePathMatch = normalizedFilePath
    ? dedupedRows.find((row) => path.resolve(row.file_path) === normalizedFilePath)
    : null;
  if (filePathMatch && matchesRequestedSession(filePathMatch)) {
    return filePathMatch;
  }
  return dedupedRows.find(matchesRequestedSession) ?? null;
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
      total_bytes: scan.total_bytes,
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
