/**
 * Provider-domain business logic.
 *
 * Covers: provider matrix, session scanning, title detection,
 * transcript parsing, and session actions (archive/delete).
 */

import {
  stat,
  open,
  readFile,
  readdir,
  copyFile,
  unlink,
  mkdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  CODEX_HOME,
  BACKUP_ROOT,
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

/* ─────────────────────────────────────────────────────────────────── *
 *  Types                                                              *
 * ─────────────────────────────────────────────────────────────────── */

export const PROVIDER_IDS = [
  "codex",
  "chatgpt",
  "claude",
  "gemini",
  "copilot",
] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];
export type ProviderStatus = "active" | "detected" | "missing";
export type ProviderSessionAction = "archive_local" | "delete_local";

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

type ProviderRootSpec = {
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

type ProviderActionTokenEntry = {
  provider: ProviderId;
  action: ProviderSessionAction;
  paths: string[];
  expires_at: number;
};

type ChatGptRootsCacheEntry = {
  expires_at: number;
  roots: ProviderRootSpec[];
};

/* ─────────────────────────────────────────────────────────────────── *
 *  Module-level caches                                                *
 * ─────────────────────────────────────────────────────────────────── */

const PROVIDER_SCAN_CACHE_TTL_MS = 60_000;
const PROVIDER_MATRIX_CACHE_TTL_MS = 30_000;
const PROVIDER_ACTION_TOKEN_TTL_MS = 10 * 60_000;
const CHATGPT_ROOT_DISCOVERY_TTL_MS = 45_000;
const providerScanCache = new Map<string, ProviderScanCacheEntry>();
const providerScanInflight = new Map<string, Promise<ProviderSessionScan>>();
const providerActionTokenCache = new Map<string, ProviderActionTokenEntry>();
let providerMatrixCache: ProviderMatrixCacheEntry | null = null;
let providerMatrixInflight: Promise<ProviderMatrixData> | null = null;
let codexTitleMapCache: CodexTitleMapCacheEntry | null = null;
let chatGptRootsCache: ChatGptRootsCacheEntry | null = null;

/* ─────────────────────────────────────────────────────────────────── *
 *  Internal helpers (not exported)                                    *
 * ─────────────────────────────────────────────────────────────────── */

function providerScanCacheKey(provider: ProviderId, limit: number): string {
  return `${provider}:${limit}`;
}

function providerName(provider: ProviderId): string {
  const labels: Record<ProviderId, string> = {
    codex: "Codex",
    chatgpt: "ChatGPT Desktop",
    claude: "Claude CLI",
    gemini: "Gemini CLI",
    copilot: "Copilot Chat",
  };
  return labels[provider] ?? provider;
}

export function listProviderIds(): ProviderId[] {
  return [...PROVIDER_IDS];
}

function supportsProviderCleanup(provider: ProviderId): boolean {
  if (provider === "chatgpt") return false;
  return true;
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

function inferSessionId(filePath: string): string {
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

function isWorkspaceChatSessionPath(filePath: string): boolean {
  const normalized = path.resolve(filePath);
  const marker = `${path.sep}chatSessions${path.sep}`;
  return normalized.includes(marker) && normalized.endsWith(".json");
}

function isCopilotGlobalSessionLikeFile(filePath: string): boolean {
  const base = path.basename(filePath).toLowerCase();
  return base.includes("session");
}

function fallbackDisplayTitle(
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

function extractCodexThreadIdFromSessionName(name: string): string {
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
          (obj as Record<string, unknown>).type === "session_meta"
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

async function probeSessionFile(
  filePath: string,
): Promise<ProviderSessionProbe> {
  const format = inferFormat(filePath);
  if (format === "unknown") {
    if (path.extname(filePath).toLowerCase() === ".data") {
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
  if (!head.trim()) {
    return {
      ok: false,
      format,
      error: "empty file",
      detected_title: detected.title,
      title_source: detected.source,
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
        detected_title: detected.title,
        title_source: detected.source,
      };
    }
    try {
      JSON.parse(first);
      return {
        ok: true,
        format,
        error: null,
        detected_title: detected.title,
        title_source: detected.source,
      };
    } catch (error) {
      return {
        ok: false,
        format,
        error: `invalid json line: ${String(error)}`,
        detected_title: detected.title,
        title_source: detected.source,
      };
    }
  }

  const prefix = head.trimStart();
  if (!(prefix.startsWith("{") || prefix.startsWith("["))) {
    return {
      ok: false,
      format,
      error: "json prefix not found",
      detected_title: detected.title,
      title_source: detected.source,
    };
  }
  return {
    ok: true,
    format,
    error: null,
    detected_title: detected.title,
    title_source: detected.source,
  };
}

/* ── Transcript building ──────────────────────────────────────────── */

function parseTranscriptRole(raw: unknown): TranscriptMessage["role"] {
  const role = String(raw ?? "").toLowerCase();
  if (
    role === "user" ||
    role === "assistant" ||
    role === "developer" ||
    role === "system" ||
    role === "tool"
  )
    return role;
  return "unknown";
}

function extractTranscriptText(value: unknown, depth = 0): string {
  if (depth > 5 || value === null || value === undefined) return "";
  if (typeof value === "string") return normalizeDetectedTitle(value, 2000);
  if (Array.isArray(value)) {
    const chunks = value
      .slice(0, 30)
      .map((item) => extractTranscriptText(item, depth + 1))
      .filter(Boolean);
    return normalizeDetectedTitle(chunks.join(" "), 2000);
  }
  if (typeof value !== "object") return "";
  const obj = value as Record<string, unknown>;
  const direct = [
    "text",
    "input_text",
    "output_text",
    "content",
    "message",
    "body",
    "value",
  ];
  for (const key of direct) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const hit = extractTranscriptText(obj[key], depth + 1);
    if (hit) return hit;
  }
  const fallback = Object.values(obj)
    .slice(0, 12)
    .map((item) => extractTranscriptText(item, depth + 1))
    .find(Boolean);
  return fallback ? normalizeDetectedTitle(fallback, 2000) : "";
}

function parseJsonlTranscriptLine(
  line: string,
): Omit<TranscriptMessage, "idx"> | null {
  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const row = obj as Record<string, unknown>;
  const type = String(row.type ?? "unknown");
  const ts = typeof row.timestamp === "string" ? row.timestamp : null;

  if (type === "response_item") {
    const payload = row.payload;
    if (!payload || typeof payload !== "object") return null;
    const payloadObj = payload as Record<string, unknown>;
    if (String(payloadObj.type ?? "") === "message") {
      const text = extractTranscriptText(payloadObj.content);
      if (!text || looksLikeIdOnly(text) || isBoilerplateTitle(text))
        return null;
      return {
        role: parseTranscriptRole(payloadObj.role),
        text,
        ts,
        source_type: "response_item.message",
      };
    }
    return null;
  }

  if (type === "event_msg") {
    const payload = row.payload;
    if (!payload || typeof payload !== "object") return null;
    const payloadObj = payload as Record<string, unknown>;
    const text = extractTranscriptText(payloadObj.message ?? payloadObj.text);
    if (!text || looksLikeIdOnly(text) || isBoilerplateTitle(text)) return null;
    return {
      role: parseTranscriptRole(payloadObj.role ?? "assistant"),
      text,
      ts,
      source_type: `event_msg.${String(payloadObj.type ?? "event")}`,
    };
  }

  const role = parseTranscriptRole(row.role);
  const text = extractTranscriptText(
    row.text ?? row.message ?? row.content ?? row.payload,
  );
  if (!text || looksLikeIdOnly(text) || isBoilerplateTitle(text)) return null;
  return {
    role,
    text,
    ts,
    source_type: type,
  };
}

/* ── Codex title map ──────────────────────────────────────────────── */

async function getCodexThreadTitleMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (codexTitleMapCache && codexTitleMapCache.expires_at > now) {
    return codexTitleMapCache.map;
  }
  const titleMap = new Map<string, string>();
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
        if (tid && txt) titleMap.set(tid, txt);
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
 *  Exported helpers (also used by route handlers in server.ts)        *
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

async function providerScanRootSpecs(
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

/* ─────────────────────────────────────────────────────────────────── *
 *  Exported business logic                                            *
 * ─────────────────────────────────────────────────────────────────── */

async function buildProviderMatrixData(): Promise<ProviderMatrixData> {
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
        hard_delete: supportsProviderCleanup("codex"),
      },
      evidence: {
        roots: [CODEX_HOME, CHAT_DIR],
        session_log_count: codexSessionLogs,
        notes: "full safety cleanup and forensics available",
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
        hard_delete: supportsProviderCleanup("chatgpt"),
      },
      evidence: {
        roots: [CHAT_DIR],
        session_log_count: chatGptSessionLogs,
        notes:
          "read-only mode: binary chat cache is observable, destructive actions are disabled",
      },
    },
    {
      provider: "claude" as ProviderId,
      name: "Claude CLI",
      status: claudeStatus,
      capability_level: capabilityLevel(
        claudeStatus,
        supportsProviderCleanup("claude") && claudeStatus !== "missing",
      ),
      capabilities: {
        read_sessions: claudeRootExists,
        analyze_context: claudeSessionLogs > 0,
        safe_cleanup: supportsProviderCleanup("claude") && claudeStatus !== "missing",
        hard_delete: supportsProviderCleanup("claude") && claudeStatus !== "missing",
      },
      evidence: {
        roots: [CLAUDE_HOME, CLAUDE_PROJECTS_DIR, CLAUDE_TRANSCRIPTS_DIR],
        session_log_count: claudeSessionLogs,
        notes:
          "dev mode: scans projects + transcripts storage for local archive/delete",
      },
    },
    {
      provider: "gemini" as ProviderId,
      name: "Gemini CLI",
      status: geminiStatus,
      capability_level: capabilityLevel(
        geminiStatus,
        supportsProviderCleanup("gemini") && geminiStatus !== "missing",
      ),
      capabilities: {
        read_sessions: geminiRootExists,
        analyze_context: geminiSessionLogs > 0,
        safe_cleanup: supportsProviderCleanup("gemini") && geminiStatus !== "missing",
        hard_delete: supportsProviderCleanup("gemini") && geminiStatus !== "missing",
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
          "dev mode: scans tmp/history plus antigravity conversation store",
      },
    },
    {
      provider: "copilot" as ProviderId,
      name: "Copilot Chat",
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
          supportsProviderCleanup("copilot") && copilotStatus !== "missing",
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
          "dev mode: scans global session artifacts + workspace chat sessions",
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
): string {
  const normalized = Array.from(
    new Set(
      filePaths
        .map((item) => path.resolve(String(item || "").trim()))
        .filter(Boolean),
    ),
  ).sort();
  const raw = JSON.stringify({
    provider,
    action,
    paths: normalized,
  });
  const digest = createHash("sha256")
    .update(raw, "utf-8")
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();
  return `PROVIDER-${digest}`;
}

function normalizeProviderActionPaths(filePaths: string[]): string[] {
  return Array.from(
    new Set(
      filePaths
        .map((item) => path.resolve(String(item || "").trim()))
        .filter(Boolean),
    ),
  ).sort();
}

function pruneProviderActionTokens(now = Date.now()) {
  for (const [token, entry] of providerActionTokenCache.entries()) {
    if (entry.expires_at <= now) providerActionTokenCache.delete(token);
  }
}

function issueProviderActionConfirmToken(
  provider: ProviderId,
  action: ProviderSessionAction,
  filePaths: string[],
): string {
  const normalized = normalizeProviderActionPaths(filePaths);
  const token = `PROVIDER-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  providerActionTokenCache.set(token, {
    provider,
    action,
    paths: normalized,
    expires_at: Date.now() + PROVIDER_ACTION_TOKEN_TTL_MS,
  });
  return token;
}

function consumeProviderActionConfirmToken(
  token: string,
  provider: ProviderId,
  action: ProviderSessionAction,
  filePaths: string[],
): { ok: boolean; reason: string } {
  pruneProviderActionTokens();
  const key = String(token || "").trim();
  if (!key) return { ok: false, reason: "missing-confirm-token" };
  const entry = providerActionTokenCache.get(key);
  if (!entry) return { ok: false, reason: "invalid-confirm-token" };
  if (entry.expires_at <= Date.now()) {
    providerActionTokenCache.delete(key);
    return { ok: false, reason: "expired-confirm-token" };
  }
  const normalized = normalizeProviderActionPaths(filePaths);
  const sameProvider = entry.provider === provider;
  const sameAction = entry.action === action;
  const samePaths =
    entry.paths.length === normalized.length &&
    entry.paths.every((item, idx) => item === normalized[idx]);
  if (!sameProvider || !sameAction || !samePaths) {
    return { ok: false, reason: "confirm-token-scope-mismatch" };
  }
  providerActionTokenCache.delete(key);
  return { ok: true, reason: "" };
}

export async function runProviderSessionAction(
  provider: ProviderId,
  action: ProviderSessionAction,
  filePaths: string[],
  dryRun: boolean,
  confirmToken: string,
) {
  pruneProviderActionTokens();
  const uniquePaths = Array.from(
    new Set(filePaths.map((item) => String(item || "").trim()).filter(Boolean)),
  );
  if (!supportsProviderCleanup(provider)) {
    return {
      ok: false,
      provider,
      action,
      dry_run: dryRun,
      target_count: uniquePaths.length,
      valid_count: 0,
      applied_count: 0,
      confirm_token_expected: "",
      confirm_token_accepted: false,
      skipped: [],
      error: "cleanup-disabled-provider",
    };
  }
  const skipped: Array<{ file_path: string; reason: string }> = [];
  const valid: string[] = [];

  for (const candidate of uniquePaths) {
    if (!isAllowedProviderFilePath(provider, candidate)) {
      skipped.push({
        file_path: candidate,
        reason: "outside-provider-root-or-extension",
      });
      continue;
    }
    try {
      const st = await stat(candidate);
      if (!st.isFile()) {
        skipped.push({ file_path: candidate, reason: "not-a-file" });
        continue;
      }
      valid.push(candidate);
    } catch {
      skipped.push({ file_path: candidate, reason: "not-found" });
    }
  }

  if (!valid.length && !dryRun) {
    return {
      ok: false,
      provider,
      action,
      dry_run: false,
      target_count: uniquePaths.length,
      valid_count: valid.length,
      applied_count: 0,
      confirm_token_expected: "",
      confirm_token_accepted: false,
      skipped,
      error: "no-valid-targets",
    };
  }

  if (dryRun) {
    const expectedToken = valid.length
      ? issueProviderActionConfirmToken(provider, action, valid)
      : "";
    return {
      ok: true,
      provider,
      action,
      dry_run: true,
      target_count: uniquePaths.length,
      valid_count: valid.length,
      applied_count: 0,
      confirm_token_expected: expectedToken,
      confirm_token_accepted: false,
      skipped,
      mode: "preview",
    };
  }

  const consume = consumeProviderActionConfirmToken(
    confirmToken,
    provider,
    action,
    valid,
  );
  if (!consume.ok) {
    const expectedToken = valid.length
      ? issueProviderActionConfirmToken(provider, action, valid)
      : "";
    return {
      ok: false,
      provider,
      action,
      dry_run: false,
      target_count: uniquePaths.length,
      valid_count: valid.length,
      applied_count: 0,
      confirm_token_expected: expectedToken,
      confirm_token_accepted: false,
      skipped,
      error: consume.reason,
    };
  }

  let applied = 0;
  let archivedTo: string | null = null;
  const failed: Array<{ file_path: string; step: string; error: string }> = [];
  if (action === "archive_local") {
    const folderName = nowIsoUtc().replace(/[:.]/g, "-");
    const destination = path.join(
      BACKUP_ROOT,
      "provider_actions",
      provider,
      folderName,
    );
    await mkdir(destination, { recursive: true });
    const manifestItems: Array<{
      source_path: string;
      backup_rel_path: string;
      backup_abs_path: string;
    }> = [];
    for (let i = 0; i < valid.length; i += 1) {
      const sourcePath = path.resolve(valid[i]);
      const relFromFsRoot = sourcePath.replace(/^([A-Za-z]:)?[\\/]+/, "");
      const targetPath = path.join(destination, relFromFsRoot);
      try {
        await mkdir(path.dirname(targetPath), { recursive: true });
        await copyFile(sourcePath, targetPath);
        manifestItems.push({
          source_path: sourcePath,
          backup_rel_path: relFromFsRoot,
          backup_abs_path: targetPath,
        });
        await unlink(sourcePath);
        applied += 1;
      } catch (error) {
        failed.push({
          file_path: sourcePath,
          step: "archive_local",
          error: String(error),
        });
      }
    }
    const manifestPath = path.join(destination, "_manifest.json");
    try {
      await writeFile(
        manifestPath,
        JSON.stringify(
          {
            generated_at: nowIsoUtc(),
            provider,
            action,
            item_count: manifestItems.length,
            items: manifestItems,
          },
          null,
          2,
        ),
        "utf-8",
      );
    } catch (error) {
      failed.push({
        file_path: manifestPath,
        step: "manifest_write",
        error: String(error),
      });
    }
    archivedTo = destination;
  } else {
    for (const sourcePath of valid) {
      try {
        await unlink(sourcePath);
        applied += 1;
      } catch (error) {
        failed.push({
          file_path: sourcePath,
          step: "delete_local",
          error: String(error),
        });
      }
    }
  }

  for (const key of providerScanCache.keys()) {
    if (key.startsWith(`${provider}:`)) {
      providerScanCache.delete(key);
    }
  }
  providerMatrixCache = null;

  return {
    ok: failed.length === 0,
    provider,
    action,
    dry_run: false,
    target_count: uniquePaths.length,
    valid_count: valid.length,
    applied_count: applied,
    confirm_token_expected: "",
    confirm_token_accepted: true,
    skipped,
    failed,
    archived_to: archivedTo,
    mode: failed.length === 0 ? "applied" : applied > 0 ? "partial" : "failed",
  };
}

/* ── Session scanning ─────────────────────────────────────────────── */

async function scanProviderSessions(
  provider: ProviderId,
  limit = 80,
): Promise<ProviderSessionScan> {
  const safeLimit = Math.max(1, Math.min(240, Number(limit) || 80));
  const roots = await providerScanRootSpecs(provider);
  const rootExists =
    provider === "chatgpt"
      ? await pathExists(CHAT_DIR)
      : (await Promise.all(roots.map((r) => pathExists(r.root)))).some(Boolean);

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
          ? files.filter((filePath) =>
              isCopilotGlobalSessionLikeFile(filePath),
            )
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
  };
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

export async function getProviderSessionsTs(
  provider?: ProviderId,
  limit = 80,
  options?: { forceRefresh?: boolean },
) {
  const targets: ProviderId[] = provider ? [provider] : listProviderIds();
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
    })),
    rows,
  };
}

export async function getProviderParserHealthTs(
  provider?: ProviderId,
  limitPerProvider = 80,
  options?: { forceRefresh?: boolean },
) {
  const targets: ProviderId[] = provider ? [provider] : listProviderIds();
  const scans = await Promise.all(
    targets.map((item) =>
      getProviderSessionScan(item, limitPerProvider, options),
    ),
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
    (sum, row) => sum + parseNumber((row as Record<string, unknown>).scanned),
    0,
  );
  const totalFail = reports.reduce(
    (sum, row) =>
      sum + parseNumber((row as Record<string, unknown>).parse_fail),
    0,
  );
  const totalOk = reports.reduce(
    (sum, row) => sum + parseNumber((row as Record<string, unknown>).parse_ok),
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

/* ── Transcript for a codex thread ────────────────────────────────── */

export async function resolveCodexSessionPathByThreadId(
  threadId: string,
): Promise<string | null> {
  const normalized = String(threadId || "").trim();
  if (!normalized) return null;

  const recent = await getProviderSessionScan("codex", 240);
  const inRecent = recent.rows.find((row) => row.session_id === normalized);
  if (inRecent) return inRecent.file_path;

  const roots = providerRootSpecs("codex");
  for (const spec of roots) {
    const files = await walkFilesByExt(spec.root, spec.exts, 8000);
    const hit = files.find((file) => path.basename(file).includes(normalized));
    if (hit) return hit;
  }
  return null;
}

export async function buildSessionTranscript(
  provider: ProviderId,
  filePath: string,
  limit: number,
): Promise<TranscriptPayload> {
  const safeLimit = Math.max(20, Math.min(2000, Number(limit) || 200));
  const format = inferFormat(filePath);
  const threadId =
    provider === "codex"
      ? extractCodexThreadIdFromSessionName(inferSessionId(filePath))
      : "";

  if (format !== "jsonl") {
    return {
      provider,
      thread_id: threadId || null,
      file_path: filePath,
      scanned_lines: 0,
      message_count: 0,
      truncated: false,
      messages: [],
    };
  }

  const tail = await readFileTail(filePath, 2_621_440);
  const lines = tail.text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const messages: TranscriptMessage[] = [];
  for (const line of lines) {
    const parsed = parseJsonlTranscriptLine(line);
    if (!parsed) continue;
    messages.push({ ...parsed, idx: messages.length + 1 });
  }

  const sliced = messages
    .slice(Math.max(0, messages.length - safeLimit))
    .map((msg, index) => ({
      ...msg,
      idx: index + 1,
    }));

  return {
    provider,
    thread_id: threadId || null,
    file_path: filePath,
    scanned_lines: lines.length,
    message_count: sliced.length,
    truncated: tail.truncated || messages.length > safeLimit,
    messages: sliced,
  };
}
