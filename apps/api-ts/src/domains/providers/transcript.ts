import { readFile } from "node:fs/promises";
import { readFileTail, isRecord } from "../../lib/utils.js";
import type {
  ProviderId,
  TranscriptMessage,
  TranscriptPayload,
} from "../../lib/providers.js";

function inferFormat(filePath: string): "jsonl" | "json" | "unknown" {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".jsonl")) return "jsonl";
  if (lower.endsWith(".json")) return "json";
  return "unknown";
}

function inferSessionId(filePath: string): string {
  const match =
    filePath.match(/\/([0-9a-f]{8}-[0-9a-f-]{27,})\.jsonl?$/i) ||
    filePath.match(/\/([^/]+)\.jsonl?$/i);
  return match ? match[1] : filePath.split("/").pop() || filePath;
}

function extractCodexThreadIdFromSessionName(name: string): string {
  const match = String(name || "").match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);
  return match ? match[0] : "";
}

function normalizeDetectedTitle(text: string, maxLen = 96): string {
  const singleLine = String(text || "").replace(/\s+/g, " ").trim();
  if (!singleLine) return "";
  return singleLine.length > maxLen
    ? `${singleLine.slice(0, maxLen - 1).trimEnd()}…`
    : singleLine;
}

function isBoilerplateTitle(text: string): boolean {
  const normalized = String(text || "").trim().toLowerCase();
  return (
    normalized === "assistant" ||
    normalized === "user" ||
    normalized === "system" ||
    normalized === "developer" ||
    normalized === "tool"
  );
}

function looksLikeIdOnly(text: string): boolean {
  const normalized = String(text || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(normalized);
}

function parseTranscriptRole(raw: unknown): TranscriptMessage["role"] {
  const role = String(raw ?? "").toLowerCase();
  if (
    role === "user" ||
    role === "assistant" ||
    role === "developer" ||
    role === "system" ||
    role === "tool"
  ) {
    return role;
  }
  return "unknown";
}

function parseProviderLikeRole(
  raw: unknown,
  provider?: ProviderId,
): TranscriptMessage["role"] {
  const direct = parseTranscriptRole(raw);
  if (direct !== "unknown") return direct;
  const role = String(raw ?? "").trim().toLowerCase();
  if (role === "human" || role === "prompt" || role === "request" || role === "question") {
    return "user";
  }
  if (
    role === "model" ||
    role === "reply" ||
    role === "response" ||
    role === "thinking" ||
    role === "gemini" ||
    role === "claude" ||
    role === "chatgpt" ||
    role === "copilot"
  ) {
    return "assistant";
  }
  if (role.includes("tool")) return "tool";
  if (!role && provider && provider !== "codex") return "assistant";
  return "unknown";
}

function normalizeTranscriptTimestamp(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim()) return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    try {
      return new Date(raw).toISOString();
    } catch {
      return null;
    }
  }
  return null;
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
  for (const key of ["text", "input_text", "output_text", "content", "message", "body", "value"]) {
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
  const ts = normalizeTranscriptTimestamp(row.timestamp ?? row.ts ?? row.time);

  if (type === "queue-operation" || type === "last-prompt") return null;

  if (type === "response_item") {
    const payload = row.payload;
    if (!payload || typeof payload !== "object") return null;
    const payloadObj = payload as Record<string, unknown>;
    if (String(payloadObj.type ?? "") === "message") {
      const text = extractTranscriptText(payloadObj.content);
      if (!text || looksLikeIdOnly(text) || isBoilerplateTitle(text)) return null;
      return {
        role: parseProviderLikeRole(payloadObj.role),
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
      role: parseProviderLikeRole(payloadObj.role ?? "assistant"),
      text,
      ts,
      source_type: `event_msg.${String(payloadObj.type ?? "event")}`,
    };
  }

  if (isRecord(row.message)) {
    const message = row.message as Record<string, unknown>;
    const text = extractTranscriptText(
      message.content ?? message.parts ?? message.text ?? row.content ?? row.text,
    );
    if (!text || looksLikeIdOnly(text) || isBoilerplateTitle(text)) return null;
    return {
      role: parseProviderLikeRole(message.role ?? row.role ?? row.type),
      text,
      ts,
      source_type: type,
    };
  }

  const role = parseTranscriptRole(row.role);
  const text = extractTranscriptText(row.text ?? row.message ?? row.content ?? row.payload);
  if (!text || looksLikeIdOnly(text) || isBoilerplateTitle(text)) return null;
  return {
    role: role === "unknown" ? parseProviderLikeRole(row.type) : role,
    text,
    ts,
    source_type: type,
  };
}

function pushTranscriptMessage(
  out: Omit<TranscriptMessage, "idx">[],
  provider: ProviderId,
  roleRaw: unknown,
  textValue: unknown,
  tsRaw: unknown,
  sourceType: string,
): void {
  const text = extractTranscriptText(textValue);
  if (!text || looksLikeIdOnly(text) || isBoilerplateTitle(text)) return;
  out.push({
    role: parseProviderLikeRole(roleRaw, provider),
    text,
    ts: normalizeTranscriptTimestamp(tsRaw),
    source_type: sourceType,
  });
}

function collectJsonTranscriptMessages(
  value: unknown,
  provider: ProviderId,
  out: Omit<TranscriptMessage, "idx">[],
  depth = 0,
  sourceType = "json",
): void {
  if (depth > 6 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 400)) {
      collectJsonTranscriptMessages(item, provider, out, depth + 1, sourceType);
    }
    return;
  }
  if (!isRecord(value)) return;

  const obj = value as Record<string, unknown>;
  const ts =
    obj.timestamp ??
    obj.ts ??
    obj.time ??
    obj.createdAt ??
    obj.creationDate ??
    obj.lastMessageDate ??
    null;

  if (isRecord(obj.message)) {
    const message = obj.message as Record<string, unknown>;
    pushTranscriptMessage(
      out,
      provider,
      message.role ?? obj.role ?? obj.type ?? obj.kind ?? "user",
      message.content ?? message.parts ?? message.text ?? message,
      message.timestamp ?? ts,
      `${sourceType}.message`,
    );
  } else if (typeof obj.message === "string") {
    pushTranscriptMessage(
      out,
      provider,
      obj.role ?? obj.type ?? obj.kind ?? "user",
      obj.message,
      ts,
      `${sourceType}.message`,
    );
  }

  const invocationValue = isRecord(obj.invocationMessage)
    ? (obj.invocationMessage as Record<string, unknown>).value
    : undefined;
  const directValue = obj.content ?? obj.text ?? obj.body ?? obj.value ?? invocationValue;
  if (directValue !== undefined) {
    pushTranscriptMessage(
      out,
      provider,
      obj.role ?? obj.type ?? obj.kind ?? obj.author ?? provider,
      directValue,
      ts,
      `${sourceType}.${String(obj.type ?? obj.kind ?? "entry")}`,
    );
  }

  for (const [key, nested] of [
    ["messages", obj.messages],
    ["requests", obj.requests],
    ["response", obj.response],
    ["responses", obj.responses],
    ["items", obj.items],
    ["events", obj.events],
    ["turns", obj.turns],
    ["conversation", obj.conversation],
  ] as const) {
    if (nested === undefined) continue;
    collectJsonTranscriptMessages(nested, provider, out, depth + 1, `${sourceType}.${key}`);
  }
}

function parseJsonTranscriptPayload(
  raw: string,
  provider: ProviderId,
): TranscriptMessage[] {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }

  const out: Omit<TranscriptMessage, "idx">[] = [];
  collectJsonTranscriptMessages(parsed, provider, out);

  const deduped = out.filter((item, index) => {
    if (index === 0) return true;
    const prev = out[index - 1];
    return !(
      prev.role === item.role &&
      prev.text === item.text &&
      prev.source_type === item.source_type
    );
  });

  return deduped.map((item, index) => ({
    ...item,
    idx: index + 1,
  }));
}

export async function buildSessionTranscript(
  provider: ProviderId,
  filePath: string,
  limit: number,
): Promise<TranscriptPayload> {
  const safeLimit = Math.max(20, Math.min(10_000, Number(limit) || 200));
  const format = inferFormat(filePath);
  const threadId =
    provider === "codex"
      ? extractCodexThreadIdFromSessionName(inferSessionId(filePath))
      : "";

  if (format === "json") {
    const raw = await readFile(filePath, "utf-8").catch(() => "");
    const messages = parseJsonTranscriptPayload(raw, provider);
    const sliced = messages
      .slice(Math.max(0, messages.length - safeLimit))
      .map((msg, index) => ({ ...msg, idx: index + 1 }));
    return {
      provider,
      thread_id: threadId || null,
      file_path: filePath,
      scanned_lines: raw ? raw.split("\n").length : 0,
      message_count: sliced.length,
      truncated: messages.length > safeLimit,
      messages: sliced,
    };
  }

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
  const parseTranscriptLines = (rawLines: string[]): TranscriptMessage[] => {
    const out: TranscriptMessage[] = [];
    for (const line of rawLines) {
      const parsed = parseJsonlTranscriptLine(line);
      if (!parsed) continue;
      out.push({ ...parsed, idx: out.length + 1 });
    }
    return out;
  };

  let lines = tail.text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  let messages = parseTranscriptLines(lines);

  if (tail.truncated && safeLimit > messages.length) {
    const fullRaw = await readFile(filePath, "utf-8").catch(() => "");
    if (fullRaw) {
      lines = fullRaw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      messages = parseTranscriptLines(lines);
    }
  }

  const sliced = messages
    .slice(Math.max(0, messages.length - safeLimit))
    .map((msg, index) => ({ ...msg, idx: index + 1 }));

  return {
    provider,
    thread_id: threadId || null,
    file_path: filePath,
    scanned_lines: lines.length,
    message_count: sliced.length,
    truncated: messages.length > safeLimit,
    messages: sliced,
  };
}
