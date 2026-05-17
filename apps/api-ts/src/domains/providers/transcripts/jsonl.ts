import {
  isRecord,
} from "../../../lib/utils.js";
import type {
  TranscriptMessage,
} from "../types.js";
import {
  extractTranscriptText,
  isBoilerplateTitle,
  looksLikeIdOnly,
  normalizeTranscriptTimestamp,
  parseProviderLikeRole,
  parseTranscriptRole,
} from "./normalizers.js";

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
    const eventType = String(payloadObj.type ?? "");
    if (eventType === "user_message" || eventType === "agent_message") return null;
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

export function parseJsonlTranscriptLines(
  rawLines: string[],
): TranscriptMessage[] {
  const out: TranscriptMessage[] = [];
  for (const line of rawLines) {
    const parsed = parseJsonlTranscriptLine(line);
    if (!parsed) continue;
    out.push({ ...parsed, idx: out.length + 1 });
  }
  return out;
}
