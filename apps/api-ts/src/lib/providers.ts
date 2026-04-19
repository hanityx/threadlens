/**
 * Provider-domain business logic.
 *
 * Covers: provider matrix, session scanning, title detection,
 * transcript parsing, and session actions (backup/archive/delete).
 */

import {
  stat,
  lstat,
  open,
  readFile,
  readdir,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import {
  PROVIDER_IDS,
  PROVIDER_LABELS,
  getProviderCapability,
  type ProviderId,
} from "@threadlens/shared-contracts";
export type { ProviderId } from "@threadlens/shared-contracts";
import {
  CODEX_HOME,
  CLAUDE_HOME,
  CLAUDE_PROJECTS_DIR,
  CLAUDE_TRANSCRIPTS_DIR,
  GEMINI_HOME,
  GEMINI_HISTORY_DIR,
  GEMINI_TMP_DIR,
  GEMINI_ANTIGRAVITY_CONVERSATIONS_DIR,
  COPILOT_VSCODE_GLOBAL,
  COPILOT_VSCODE_WORKSPACE_STORAGE,
  COPILOT_CURSOR_GLOBAL,
  COPILOT_CURSOR_WORKSPACE_STORAGE,
  HOME_DIR,
  CHAT_DIR,
} from "./constants.js";
import {
  pathExists,
  readFileHead,
  readFileTail,
  walkFilesByExt,
  countFilesRecursiveByExt,
  countJsonlFilesRecursive,
  quickFileCount,
  safeJsonParse,
  isRecord,
  nowIsoUtc,
  parseNumber,
} from "./utils.js";
import { buildSessionTranscript } from "../domains/providers/transcript.js";
import {
  buildProviderActionToken as buildProviderActionTokenInternal,
  runProviderSessionAction as runProviderSessionActionInternal,
} from "../domains/providers/actions.js";
import { invalidateProviderSearchCaches } from "../domains/providers/search.js";

/* ─────────────────────────────────────────────────────────────────── *
 *  Types                                                              *
 * ─────────────────────────────────────────────────────────────────── */

export type ProviderStatus = "active" | "detected" | "missing";
export type ProviderSessionAction =
  | "backup_local"
  | "archive_local"
  | "delete_local";

export type ProviderSessionActionOptions = {
  backup_before_delete?: boolean;
};

export type ProviderSessionProbe = {
  ok: boolean;
  format: "jsonl" | "json" | "unknown";
  error: string | null;
  detected_title: string;
  title_source: string | null;
};

export type ProviderSessionRow = {
  provider: ProviderId;
  source: string;
  session_id: string;
  display_title: string;
  file_path: string;
  size_bytes: number;
  mtime: string;
  probe: ProviderSessionProbe;
};

export type ProviderSessionScan = {
  provider: ProviderId;
  name: string;
  status: ProviderStatus;
  rows: ProviderSessionRow[];
  scanned: number;
  truncated: boolean;
  scan_ms: number;
};

export type TranscriptMessage = {
  idx: number;
  role: "user" | "assistant" | "developer" | "system" | "tool" | "unknown";
  text: string;
  ts: string | null;
  source_type: string;
};

export type TranscriptPayload = {
  provider: ProviderId;
  thread_id: string | null;
  file_path: string;
  scanned_lines: number;
  message_count: number;
  truncated: boolean;
  messages: TranscriptMessage[];
};

export type ConversationSearchMatchKind = "title" | "message";

export type ConversationSearchResult = {
  provider: ProviderId;
  session_id: string;
  thread_id?: string | null;
  title: string;
  file_path: string;
  mtime: string;
  match_kind: ConversationSearchMatchKind;
  snippet: string;
  role?: TranscriptMessage["role"];
};

export type ConversationSearchPayload = {
  generated_at: string;
  q: string;
  providers: ProviderId[];
  limit: number;
  searched_sessions: number;
  available_sessions: number;
  truncated: boolean;
  results: ConversationSearchResult[];
};

export type ProviderRootSpec = {
  source: string;
  root: string;
  exts: string[];
};

type CodexTitleMapCacheEntry = {
  expires_at: number;
  map: Map<string, string>;
};

type ProviderScanCacheEntry = {
  expires_at: number;
  scan: ProviderSessionScan;
};

type ProviderMatrixData = {
  generated_at: string;
  mode: string;
  summary: {
    total: number;
    active: number;
    detected: number;
    read_analyze_ready: number;
    safe_cleanup_ready: number;
    hard_delete_ready: number;
  };
  providers: Array<{
    provider: ProviderId;
    name: string;
    status: ProviderStatus;
    capability_level: "full" | "read-only" | "unavailable";
    capabilities: {
      read_sessions: boolean;
      analyze_context: boolean;
      safe_cleanup: boolean;
      hard_delete: boolean;
    };
    evidence: {
      roots: string[];
      session_log_count: number;
      notes: string;
    };
  }>;
  policy: {
    cleanup_gate: string;
    default_non_codex: string;
  };
};

type ProviderMatrixCacheEntry = {
  expires_at: number;
  data: ProviderMatrixData;
};

type ChatGptRootsCacheEntry = {
  expires_at: number;
  roots: ProviderRootSpec[];
};

/* ─────────────────────────────────────────────────────────────────── *
 *  Module-level caches                                                *
 * ─────────────────────────────────────────────────────────────────── */

const PROVIDER_MATRIX_CACHE_TTL_MS = 30_000;
const CHATGPT_ROOT_DISCOVERY_TTL_MS = 45_000;
let providerMatrixCache: ProviderMatrixCacheEntry | null = null;
let providerMatrixInflight: Promise<ProviderMatrixData> | null = null;
let codexTitleMapCache: CodexTitleMapCacheEntry | null = null;
let chatGptRootsCache: ChatGptRootsCacheEntry | null = null;

export function invalidateCodexThreadTitleMapCache() {
  codexTitleMapCache = null;
}

/* ─────────────────────────────────────────────────────────────────── *
 *  Internal helpers (not exported)                                    *
 * ─────────────────────────────────────────────────────────────────── */

export function providerName(provider: ProviderId): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

export function listProviderIds(): ProviderId[] {
  return [...PROVIDER_IDS];
}

function supportsProviderCleanup(provider: ProviderId): boolean {
  return getProviderCapability(provider).safe_cleanup;
}

function supportsProviderHardDelete(provider: ProviderId): boolean {
  return getProviderCapability(provider).hard_delete;
}

async function discoverChatGptConversationRoots(): Promise<ProviderRootSpec[]> {
  const now = Date.now();
  if (chatGptRootsCache && chatGptRootsCache.expires_at > now) {
    return chatGptRootsCache.roots;
  }
  if (!(await pathExists(CHAT_DIR))) return [];
  const out = new Map<string, ProviderRootSpec>();
  const push = (source: string, root: string) => {
    if (!out.has(root)) out.set(root, { source, root, exts: [".data"] });
  };

  const topLevel = await readdir(CHAT_DIR, { withFileTypes: true }).catch(
    () => [],
  );

  for (const entry of topLevel) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("conversations-v3-")) {
      push("conversations", path.join(CHAT_DIR, entry.name));
      continue;
    }
    if (!entry.name.startsWith("project-g-p-")) continue;
    const projectDir = path.join(CHAT_DIR, entry.name);
    const nested = await readdir(projectDir, { withFileTypes: true }).catch(
      () => [],
    );
    for (const child of nested) {
      if (!child.isDirectory()) continue;
      if (!child.name.startsWith("conversations-v3-")) continue;
      push("project-conversations", path.join(projectDir, child.name));
    }
  }

  const roots = Array.from(out.values());
  chatGptRootsCache = {
    expires_at: now + CHATGPT_ROOT_DISCOVERY_TTL_MS,
    roots,
  };
  return roots;
}

function inferFormat(filePath: string): "jsonl" | "json" | "unknown" {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jsonl") return "jsonl";
  if (ext === ".json") return "json";
  return "unknown";
}

export function inferSessionId(filePath: string): string {
  const base = path.basename(filePath);
  const ext = path.extname(base);
  if (!ext) return base;
  return base.slice(0, -ext.length);
}

function shortSessionId(sessionId: string): string {
  const id = String(sessionId || "").trim();
  if (!id) return "unknown";
  if (id.length <= 20) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export function normalizeSearchText(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function normalizeSearchQuery(value: string): string {
  return normalizeSearchText(value).toLowerCase();
}

export function buildSearchTokens(query: string): string[] {
  return Array.from(
    new Set(
      normalizeSearchQuery(query)
        .split(" ")
        .map((token) => token.trim())
        .filter(Boolean),
    ),
  );
}

function findSearchMatchIndex(
  text: string,
  normalizedQuery: string,
  tokens: string[],
): number {
  const normalizedText = normalizeSearchQuery(text);
  if (!normalizedText) return -1;
  if (normalizedQuery) {
    const queryIndex = normalizedText.indexOf(normalizedQuery);
    if (queryIndex >= 0) return queryIndex;
  }
  for (const token of tokens) {
    const tokenIndex = normalizedText.indexOf(token);
    if (tokenIndex >= 0) return tokenIndex;
  }
  return -1;
}

export function matchesConversationSearch(
  text: string,
  normalizedQuery: string,
  tokens: string[],
): boolean {
  const normalizedText = normalizeSearchQuery(text);
  if (!normalizedText) return false;
  if (normalizedQuery && normalizedText.includes(normalizedQuery)) return true;
  if (!tokens.length) return false;
  return tokens.every((token) => normalizedText.includes(token));
}

export function buildSearchSnippet(
  text: string,
  normalizedQuery: string,
  tokens: string[],
  maxLen = 180,
): string {
  const clean = normalizeSearchText(text);
  if (!clean) return "";
  if (clean.length <= maxLen) return clean;
  const matchIndex = findSearchMatchIndex(clean, normalizedQuery, tokens);
  if (matchIndex < 0) return `${clean.slice(0, maxLen - 1).trim()}…`;
  const context = Math.max(32, Math.floor(maxLen / 2));
  const start = Math.max(0, matchIndex - context);
  const end = Math.min(clean.length, start + maxLen);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < clean.length ? "…" : "";
  return `${prefix}${clean.slice(start, end).trim()}${suffix}`;
}

export function isWorkspaceChatSessionPath(filePath: string): boolean {
  const normalized = path.resolve(filePath);
  const marker = `${path.sep}chatSessions${path.sep}`;
  return normalized.includes(marker) && normalized.endsWith(".json");
}

export function isCopilotGlobalSessionLikeFile(filePath: string): boolean {
  const base = path.basename(filePath).toLowerCase();
  return base.includes("session");
}

export function fallbackDisplayTitle(
  provider: ProviderId,
  sessionId: string,
  source: string,
): string {
  const shortId = shortSessionId(sessionId);
  if (provider === "chatgpt") {
    if (source === "project-conversations") {
      return `ChatGPT Project · ${shortId}`;
    }
    return `ChatGPT Conversation · ${shortId}`;
  }
  return shortId;
}

function extractUuidFromText(text: string): string {
  const m = String(text || "").match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  return m ? m[0] : "";
}

export function extractCodexThreadIdFromSessionName(name: string): string {
  return extractUuidFromText(name);
}

function normalizeDetectedTitle(text: string, maxLen = 96): string {
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f]/g, " ")
    .trim();
  if (!cleaned) return "";
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen - 1).trim()}…`;
}

function isBoilerplateTitle(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return true;
  if (t === "input_text" || t === "output_text" || t === "default") return true;
  if (t.includes("<instructions>")) return true;
  if (t.includes("<environment_context>")) return true;
  if (t.includes("<cwd>") && t.includes("<shell>")) return true;
  if (t.startsWith("# agents.md instructions")) return true;
  if (t.includes("## skills a skill is a set")) return true;
  if (t.includes("you are codex, a coding agent")) return true;
  return false;
}

function looksLikeIdOnly(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/^[0-9a-f]{8,}$/i.test(t)) return true;
  if (/^[0-9a-f-]{16,}$/i.test(t)) return true;
  return false;
}

function looksLikeTimestampOnly(text: string): boolean {
  const t = text.trim();
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?$/.test(t);
}

function pickTextCandidate(value: unknown, depth = 0): string {
  if (depth > 3 || value === null || value === undefined) return "";
  if (typeof value === "string") {
    const t = normalizeDetectedTitle(value);
    if (
      t.length < 4 ||
      looksLikeIdOnly(t) ||
      looksLikeTimestampOnly(t) ||
      isBoilerplateTitle(t)
    )
      return "";
    return t;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 6)) {
      const hit = pickTextCandidate(item, depth + 1);
      if (hit) return hit;
    }
    return "";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const priorityKeys = [
      "title",
      "summary",
      "prompt",
      "input",
      "text",
      "content",
      "message",
      "body",
      "query",
      "question",
    ];
    for (const key of priorityKeys) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      const hit = pickTextCandidate(obj[key], depth + 1);
      if (hit) return hit;
    }
    const fallbackEntries = Object.entries(obj).filter(([key]) => {
      const k = key.toLowerCase();
      return k !== "type" && k !== "role" && k !== "timestamp";
    });
    for (const [, item] of fallbackEntries.slice(0, 8)) {
      const hit = pickTextCandidate(item, depth + 1);
      if (hit) return hit;
    }
  }
  return "";
}

function detectSessionTitleFromHead(
  head: string,
  format: "jsonl" | "json" | "unknown",
): { title: string; source: string | null } {
  const trimmed = head.trim();
  if (!trimmed) return { title: "", source: null };

  if (format === "jsonl") {
    const lines = trimmed
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 40);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (
          obj &&
          typeof obj === "object" &&
          ((obj as Record<string, unknown>).type === "session_meta" ||
            (obj as Record<string, unknown>).type === "turn_context")
        ) {
          continue;
        }
        if (
          obj &&
          typeof obj === "object" &&
          (obj as Record<string, unknown>).type === "response_item"
        ) {
          const payload = (obj as Record<string, unknown>).payload;
          if (payload && typeof payload === "object") {
            const payloadObj = payload as Record<string, unknown>;
            if (payloadObj.type === "message") {
              const role = String(payloadObj.role ?? "").toLowerCase();
              if (role === "user") {
                const hit = pickTextCandidate(payloadObj.content);
                if (hit && !isBoilerplateTitle(hit))
                  return { title: hit, source: "jsonl-response-item-user" };
              }
              if (role === "developer" || role === "system") {
                continue;
              }
            }
          }
        }
        if (
          obj &&
          typeof obj === "object" &&
          (obj as Record<string, unknown>).type === "response_item"
        ) {
          const payload = (obj as Record<string, unknown>).payload;
          if (payload && typeof payload === "object") {
            const payloadObj = payload as Record<string, unknown>;
            if (payloadObj.type === "message" && payloadObj.role === "user") {
              const hit = pickTextCandidate(payloadObj.content);
              if (hit && !isBoilerplateTitle(hit))
                return { title: hit, source: "jsonl-user-message" };
            }
          }
        }
        const hit = pickTextCandidate(obj);
        if (hit && !isBoilerplateTitle(hit))
          return { title: hit, source: "jsonl-content" };
      } catch {
        // no-op
      }
    }
    const fallbackLine = normalizeDetectedTitle(
      lines.find((line) => !line.startsWith("{")) ?? "",
    );
    return { title: fallbackLine, source: fallbackLine ? "jsonl-line" : null };
  }

  if (format === "json") {
    try {
      const obj = JSON.parse(trimmed);
      const hit = pickTextCandidate(obj);
      if (hit) return { title: hit, source: "json-content" };
    } catch {
      const m = trimmed.match(/"title"\s*:\s*"([^"]+)"/i);
      const hit = normalizeDetectedTitle(m?.[1] ?? "");
      if (hit) return { title: hit, source: "json-title-field" };
    }
  }

  return { title: "", source: null };
}

/* ── Session probing ──────────────────────────────────────────────── */

export async function probeSessionFile(
  filePath: string,
): Promise<ProviderSessionProbe> {
  const format = inferFormat(filePath);
  if (format === "unknown") {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".data" || ext === ".pb") {
      const idHint = normalizeDetectedTitle(inferSessionId(filePath));
      return {
        ok: true,
        format,
        error: null,
        detected_title: idHint,
        title_source: idHint ? "binary-cache-id" : null,
      };
    }
    return {
      ok: false,
      format,
      error: "unsupported extension",
      detected_title: "",
      title_source: null,
    };
  }
  let head = await readFileHead(filePath, format === "jsonl" ? 12288 : 12288);
  if (format === "jsonl") {
    const lineCount = head.split("\n").length;
    const likelyTruncatedSingleLine = head.length >= 12000 && lineCount <= 2;
    if (likelyTruncatedSingleLine) {
      head = await readFileHead(filePath, 524288);
    }
  }
  const detected = detectSessionTitleFromHead(head, format);
  const claudeRenamedTitle = await detectClaudeRenamedTitle(filePath, format);
  const effectiveDetected = claudeRenamedTitle ?? detected;
  if (!head.trim()) {
    // Empty legacy/session placeholder files are common in Copilot/CLI caches.
    // Treat them as ignorable (not parse-fail) to avoid false alarms in health views.
    return {
      ok: true,
      format,
      error: null,
      detected_title: effectiveDetected.title,
      title_source: effectiveDetected.source,
    };
  }

  if (format === "jsonl") {
    const first = head
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean);
    if (!first) {
      return {
        ok: false,
        format,
        error: "no json line found",
        detected_title: effectiveDetected.title,
        title_source: effectiveDetected.source,
      };
    }
    try {
      JSON.parse(first);
      return {
        ok: true,
        format,
        error: null,
        detected_title: effectiveDetected.title,
        title_source: effectiveDetected.source,
      };
    } catch (error) {
      return {
        ok: false,
        format,
        error: `invalid json line: ${String(error)}`,
        detected_title: effectiveDetected.title,
        title_source: effectiveDetected.source,
      };
    }
  }

  const prefix = head.trimStart();
  if (!(prefix.startsWith("{") || prefix.startsWith("["))) {
    return {
      ok: false,
      format,
      error: "json prefix not found",
      detected_title: effectiveDetected.title,
      title_source: effectiveDetected.source,
    };
  }
  return {
    ok: true,
    format,
    error: null,
    detected_title: effectiveDetected.title,
    title_source: effectiveDetected.source,
  };
}

async function detectClaudeRenamedTitle(
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

/* ── Codex title map ──────────────────────────────────────────────── */

export async function getCodexThreadTitleMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (codexTitleMapCache && codexTitleMapCache.expires_at > now) {
    return codexTitleMapCache.map;
  }
  const titleMap = new Map<string, string>();
  const globalStateTitleIds = new Set<string>();
  try {
    const raw = await readFile(
      path.join(CODEX_HOME, ".codex-global-state.json"),
      "utf-8",
    );
    const parsed = safeJsonParse(raw);
    const blob =
      isRecord(parsed) && isRecord(parsed["thread-titles"])
        ? (parsed["thread-titles"] as Record<string, unknown>)
        : null;
    const titles =
      blob && isRecord(blob.titles)
        ? (blob.titles as Record<string, unknown>)
        : null;
    if (titles) {
      for (const [id, title] of Object.entries(titles)) {
        const tid = extractUuidFromText(id);
        const txt = normalizeDetectedTitle(String(title ?? ""));
        if (tid && txt) {
          titleMap.set(tid, txt);
          globalStateTitleIds.add(tid);
        }
      }
    }
  } catch {
    // no-op
  }
  try {
    const raw = await readFile(path.join(CODEX_HOME, "session_index.jsonl"), "utf-8");
    for (const line of raw.split(/\r?\n/)) {
      const parsed = safeJsonParse(line);
      if (!isRecord(parsed)) continue;
      const tid = extractUuidFromText(String(parsed.id ?? ""));
      const txt = normalizeDetectedTitle(String(parsed.thread_name ?? ""));
      if (tid && txt && !globalStateTitleIds.has(tid)) {
        titleMap.set(tid, txt);
      }
    }
  } catch {
    // no-op
  }
  codexTitleMapCache = {
    expires_at: now + 60_000,
    map: titleMap,
  };
  return titleMap;
}

/* ─────────────────────────────────────────────────────────────────── *
 *  Exported helpers (also used by route handlers in app/create-server.ts)
 * ─────────────────────────────────────────────────────────────────── */

export function providerStatus(
  rootExists: boolean,
  sessionLogs: number,
): ProviderStatus {
  if (sessionLogs > 0) return "active";
  if (rootExists) return "detected";
  return "missing";
}

export function capabilityLevel(
  status: ProviderStatus,
  safeCleanup: boolean,
): "full" | "read-only" | "unavailable" {
  if (safeCleanup) return "full";
  if (status !== "missing") return "read-only";
  return "unavailable";
}

export function parseProviderId(raw: unknown): ProviderId | undefined {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if ((PROVIDER_IDS as readonly string[]).includes(value)) {
    return value as ProviderId;
  }
  return undefined;
}

export function isPathInsideRoot(
  targetPath: string,
  rootPath: string,
): boolean {
  const fullTarget = path.resolve(targetPath);
  const fullRoot = path.resolve(rootPath);
  return (
    fullTarget === fullRoot || fullTarget.startsWith(`${fullRoot}${path.sep}`)
  );
}

export function providerRootSpecs(provider: ProviderId): ProviderRootSpec[] {
  if (provider === "codex") {
    return [
      {
        source: "sessions",
        root: path.join(CODEX_HOME, "sessions"),
        exts: [".jsonl"],
      },
      {
        source: "archived_sessions",
        root: path.join(CODEX_HOME, "archived_sessions"),
        exts: [".jsonl"],
      },
    ];
  }
  if (provider === "chatgpt") {
    return [{ source: "chat_cache", root: CHAT_DIR, exts: [".data"] }];
  }
  if (provider === "claude") {
    return [
      { source: "projects", root: CLAUDE_PROJECTS_DIR, exts: [".jsonl"] },
      {
        source: "transcripts",
        root: CLAUDE_TRANSCRIPTS_DIR,
        exts: [".jsonl", ".json"],
      },
    ];
  }
  if (provider === "gemini") {
    return [
      { source: "tmp", root: GEMINI_TMP_DIR, exts: [".jsonl", ".json"] },
      { source: "history", root: GEMINI_HISTORY_DIR, exts: [".jsonl", ".json"] },
      {
        source: "antigravity_conversations",
        root: GEMINI_ANTIGRAVITY_CONVERSATIONS_DIR,
        exts: [".pb"],
      },
    ];
  }
  return [
    {
      source: "vscode_global",
      root: COPILOT_VSCODE_GLOBAL,
      exts: [".jsonl", ".json"],
    },
    {
      source: "cursor_global",
      root: COPILOT_CURSOR_GLOBAL,
      exts: [".jsonl", ".json"],
    },
    {
      source: "vscode_workspace_chats",
      root: COPILOT_VSCODE_WORKSPACE_STORAGE,
      exts: [".json"],
    },
    {
      source: "cursor_workspace_chats",
      root: COPILOT_CURSOR_WORKSPACE_STORAGE,
      exts: [".json"],
    },
  ];
}

export function codexTranscriptSearchRoots(): ProviderRootSpec[] {
  const homes = Array.from(
    new Set([
      CODEX_HOME,
      path.join(HOME_DIR, ".codex-cli"),
      path.join(HOME_DIR, ".codex"),
    ].filter(Boolean)),
  );
  const roots: ProviderRootSpec[] = [];
  for (const home of homes) {
    roots.push({
      source: "sessions",
      root: path.join(home, "sessions"),
      exts: [".jsonl"],
    });
    roots.push({
      source: "archived_sessions",
      root: path.join(home, "archived_sessions"),
      exts: [".jsonl"],
    });
  }
  return roots;
}

export async function providerScanRootSpecs(
  provider: ProviderId,
): Promise<ProviderRootSpec[]> {
  if (provider !== "chatgpt") return providerRootSpecs(provider);
  const discovered = await discoverChatGptConversationRoots();
  if (discovered.length > 0) return discovered;
  return providerRootSpecs(provider);
}

export function isAllowedProviderFilePath(
  provider: ProviderId,
  filePath: string,
): boolean {
  if (provider === "chatgpt") {
    const ext = path.extname(filePath).toLowerCase();
    if (ext !== ".data") return false;
    if (!isPathInsideRoot(filePath, CHAT_DIR)) return false;
    const normalized = path.resolve(filePath);
    return /(^|[\\/])conversations-v3-[^\\/]+[\\/]/.test(normalized);
  }
  const specs = providerRootSpecs(provider);
  const ext = path.extname(filePath).toLowerCase();
  return specs.some(
    (spec) => spec.exts.includes(ext) && isPathInsideRoot(filePath, spec.root),
  );
}

export async function resolveSafePathWithinRoots(
  filePath: string,
  rootPaths: string[],
): Promise<string | null> {
  const normalizedTarget = path.resolve(filePath);
  let targetLstat;
  try {
    targetLstat = await lstat(normalizedTarget);
  } catch {
    return null;
  }
  if (targetLstat.isSymbolicLink()) return null;

  let realTarget = "";
  try {
    realTarget = await realpath(normalizedTarget);
  } catch {
    return null;
  }

  for (const rootPath of rootPaths) {
    try {
      const realRoot = await realpath(rootPath);
      if (
        realTarget === realRoot ||
        realTarget.startsWith(`${realRoot}${path.sep}`)
      ) {
        return realTarget;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function resolveAllowedProviderFilePath(
  provider: ProviderId,
  filePath: string,
): Promise<string | null> {
  if (!isAllowedProviderFilePath(provider, filePath)) return null;

  if (provider === "chatgpt") {
    return resolveSafePathWithinRoots(filePath, [CHAT_DIR]);
  }

  const ext = path.extname(filePath).toLowerCase();
  const matchingRoots = providerRootSpecs(provider)
    .filter(
      (spec) => spec.exts.includes(ext) && isPathInsideRoot(filePath, spec.root),
    )
    .map((spec) => spec.root);

  if (!matchingRoots.length) return null;
  return resolveSafePathWithinRoots(filePath, matchingRoots);
}

/* ─────────────────────────────────────────────────────────────────── *
 *  Exported business logic                                            *
 * ─────────────────────────────────────────────────────────────────── */

async function buildProviderMatrixData(): Promise<ProviderMatrixData> {
  const codexHomes = Array.from(
    new Set(codexTranscriptSearchRoots().map((spec) => path.dirname(spec.root))),
  );
  const codexRootExists = await pathExists(CODEX_HOME);
  const chatGptRootExists = await pathExists(CHAT_DIR);
  const claudeRootExists = await pathExists(CLAUDE_HOME);
  const geminiRootExists = await pathExists(GEMINI_HOME);
  const copilotVsCodeExists = await pathExists(COPILOT_VSCODE_GLOBAL);
  const copilotCursorExists = await pathExists(COPILOT_CURSOR_GLOBAL);
  const copilotVsCodeWorkspaceExists = await pathExists(
    COPILOT_VSCODE_WORKSPACE_STORAGE,
  );
  const copilotCursorWorkspaceExists = await pathExists(
    COPILOT_CURSOR_WORKSPACE_STORAGE,
  );
  const chatGptConversationRoots = await discoverChatGptConversationRoots();

  const codexSessionLogs =
    (await countJsonlFilesRecursive(path.join(CODEX_HOME, "sessions"))) +
    (await countJsonlFilesRecursive(
      path.join(CODEX_HOME, "archived_sessions"),
    ));
  const claudeSessionLogs =
    (await countFilesRecursiveByExt(CLAUDE_PROJECTS_DIR, [".jsonl", ".json"])) +
    (await countFilesRecursiveByExt(CLAUDE_TRANSCRIPTS_DIR, [".jsonl", ".json"]));
  const geminiSessionLogs =
    (await countFilesRecursiveByExt(GEMINI_TMP_DIR, [".jsonl", ".json"])) +
    (await countFilesRecursiveByExt(GEMINI_HISTORY_DIR, [".jsonl", ".json"])) +
    (await countFilesRecursiveByExt(GEMINI_ANTIGRAVITY_CONVERSATIONS_DIR, [".pb"]));
  const chatGptSessionLogs = (
    await Promise.all(
      chatGptConversationRoots.map((spec) => quickFileCount(spec.root)),
    )
  ).reduce((sum, count) => sum + count, 0);
  const copilotGlobalSessionFiles = (
    await Promise.all(
      [COPILOT_VSCODE_GLOBAL, COPILOT_CURSOR_GLOBAL].map(async (root) => {
        const files = await walkFilesByExt(root, [".jsonl", ".json"], 1500);
        return files.filter((filePath) =>
          isCopilotGlobalSessionLikeFile(filePath),
        ).length;
      }),
    )
  ).reduce((sum, value) => sum + value, 0);
  const copilotWorkspaceChatFiles = (
    await Promise.all(
      [
        COPILOT_VSCODE_WORKSPACE_STORAGE,
        COPILOT_CURSOR_WORKSPACE_STORAGE,
      ].map(async (root) => {
        const files = await walkFilesByExt(root, [".json"], 8000);
        return files.filter((filePath) =>
          isWorkspaceChatSessionPath(filePath),
        ).length;
      }),
    )
  ).reduce((sum, value) => sum + value, 0);
  const copilotSignalFiles = copilotGlobalSessionFiles + copilotWorkspaceChatFiles;

  const codexStatus = providerStatus(codexRootExists, codexSessionLogs);
  const chatGptStatus = providerStatus(chatGptRootExists, chatGptSessionLogs);
  const claudeStatus = providerStatus(claudeRootExists, claudeSessionLogs);
  const geminiStatus = providerStatus(geminiRootExists, geminiSessionLogs);
  const copilotStatus = providerStatus(
    copilotVsCodeExists ||
      copilotCursorExists ||
      copilotVsCodeWorkspaceExists ||
      copilotCursorWorkspaceExists,
    copilotSignalFiles,
  );

  const providers = [
    {
      provider: "codex" as ProviderId,
      name: "Codex",
      status: codexStatus,
      capability_level: capabilityLevel(codexStatus, supportsProviderCleanup("codex")),
      capabilities: {
        read_sessions: true,
        analyze_context: true,
        safe_cleanup: supportsProviderCleanup("codex"),
        hard_delete: supportsProviderHardDelete("codex"),
      },
      evidence: {
        roots: codexHomes,
        session_log_count: codexSessionLogs,
        notes:
          "This is an operations-grade model built around thread_id, pinned state, and global state, so impact analysis and cleanup dry-runs live in a dedicated surface.",
      },
    },
    {
      provider: "chatgpt" as ProviderId,
      name: providerName("chatgpt"),
      status: chatGptStatus,
      capability_level: capabilityLevel(
        chatGptStatus,
        supportsProviderCleanup("chatgpt"),
      ),
      capabilities: {
        read_sessions: chatGptRootExists,
        analyze_context: chatGptSessionLogs > 0,
        safe_cleanup: supportsProviderCleanup("chatgpt"),
        hard_delete: supportsProviderHardDelete("chatgpt"),
      },
      evidence: {
        roots: [CHAT_DIR],
        session_log_count: chatGptSessionLogs,
        notes:
          "Read-first cache model: focused on desktop cache and conversation artifacts, with destructive actions disabled.",
      },
    },
    {
      provider: "claude" as ProviderId,
      name: providerName("claude"),
      status: claudeStatus,
      capability_level: capabilityLevel(
        claudeStatus,
        supportsProviderCleanup("claude") && claudeStatus !== "missing",
      ),
      capabilities: {
        read_sessions: claudeRootExists,
        analyze_context: claudeSessionLogs > 0,
        safe_cleanup: supportsProviderCleanup("claude") && claudeStatus !== "missing",
        hard_delete:
          supportsProviderHardDelete("claude") && claudeStatus !== "missing",
      },
      evidence: {
        roots: [CLAUDE_HOME, CLAUDE_PROJECTS_DIR, CLAUDE_TRANSCRIPTS_DIR],
        session_log_count: claudeSessionLogs,
        notes:
          "Managed around session_id plus raw project and transcript files. Reading the original conversation and running file-level dry-runs is the main path.",
      },
    },
    {
      provider: "gemini" as ProviderId,
      name: providerName("gemini"),
      status: geminiStatus,
      capability_level: capabilityLevel(
        geminiStatus,
        supportsProviderCleanup("gemini") && geminiStatus !== "missing",
      ),
      capabilities: {
        read_sessions: geminiRootExists,
        analyze_context: geminiSessionLogs > 0,
        safe_cleanup: supportsProviderCleanup("gemini") && geminiStatus !== "missing",
        hard_delete:
          supportsProviderHardDelete("gemini") && geminiStatus !== "missing",
      },
      evidence: {
        roots: [
          GEMINI_HOME,
          GEMINI_TMP_DIR,
          GEMINI_HISTORY_DIR,
          GEMINI_ANTIGRAVITY_CONVERSATIONS_DIR,
        ],
        session_log_count: geminiSessionLogs,
        notes:
          "Managed across history, tmp, and checkpoint-style session stores. Raw session-store distribution matters more than a thread model here.",
      },
    },
    {
      provider: "copilot" as ProviderId,
      name: providerName("copilot"),
      status: copilotStatus,
      capability_level: capabilityLevel(
        copilotStatus,
        supportsProviderCleanup("copilot") && copilotStatus !== "missing",
      ),
      capabilities: {
        read_sessions:
          copilotVsCodeExists ||
          copilotCursorExists ||
          copilotVsCodeWorkspaceExists ||
          copilotCursorWorkspaceExists,
        analyze_context: copilotSignalFiles > 0,
        safe_cleanup:
          supportsProviderCleanup("copilot") && copilotStatus !== "missing",
        hard_delete:
          supportsProviderHardDelete("copilot") && copilotStatus !== "missing",
      },
      evidence: {
        roots: [
          COPILOT_VSCODE_GLOBAL,
          COPILOT_CURSOR_GLOBAL,
          COPILOT_VSCODE_WORKSPACE_STORAGE,
          COPILOT_CURSOR_WORKSPACE_STORAGE,
        ],
        session_log_count: copilotSignalFiles,
        notes:
          "Auxiliary diagnostics only: scans global traces and workspace chat sessions, but it is not part of the core operating path.",
      },
    },
  ];

  const summary = {
    total: providers.length,
    active: providers.filter((x) => x.status === "active").length,
    detected: providers.filter((x) => x.status !== "missing").length,
    read_analyze_ready: providers.filter(
      (x) => x.capabilities.read_sessions && x.capabilities.analyze_context,
    ).length,
    safe_cleanup_ready: providers.filter((x) => x.capabilities.safe_cleanup)
      .length,
    hard_delete_ready: providers.filter((x) => x.capabilities.hard_delete)
      .length,
  };

  return {
    generated_at: nowIsoUtc(),
    mode: "multi-provider-phase-1",
    summary,
    providers,
    policy: {
      cleanup_gate: "provider capability matrix controls destructive actions",
      default_non_codex: "all detected providers are visible for local analysis",
    },
  };
}

export async function getProviderMatrixTs(options?: { forceRefresh?: boolean }) {
  const forceRefresh = Boolean(options?.forceRefresh);
  const now = Date.now();
  if (!forceRefresh && providerMatrixCache && providerMatrixCache.expires_at > now) {
    return providerMatrixCache.data;
  }
  if (forceRefresh) {
    providerMatrixCache = null;
  }
  if (providerMatrixInflight) {
    return providerMatrixInflight;
  }

  providerMatrixInflight = buildProviderMatrixData()
    .then((data) => {
      providerMatrixCache = {
        expires_at: Date.now() + PROVIDER_MATRIX_CACHE_TTL_MS,
        data,
      };
      return data;
    })
    .finally(() => {
      providerMatrixInflight = null;
    });

  return providerMatrixInflight;
}

/* ── Session actions ──────────────────────────────────────────────── */

export function buildProviderActionToken(
  provider: ProviderId,
  action: ProviderSessionAction,
  filePaths: string[],
  options?: ProviderSessionActionOptions,
): string {
  return buildProviderActionTokenInternal(provider, action, filePaths, options);
}

export async function runProviderSessionAction(
  provider: ProviderId,
  action: ProviderSessionAction,
  filePaths: string[],
  dryRun: boolean,
  confirmToken: string,
  options?: ProviderSessionActionOptions,
) {
  return runProviderSessionActionInternal(
    {
      resolveAllowedProviderFilePath,
      supportsProviderCleanup,
      invalidateProviderCaches: (targetProvider) => {
        invalidateProviderSearchCaches(targetProvider);
        providerMatrixCache = null;
      },
    },
    provider,
    action,
    filePaths,
    dryRun,
    confirmToken,
    options,
  );
}

export { buildSessionTranscript };
