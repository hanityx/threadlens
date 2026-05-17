import {
  isRecord,
} from "../../../../lib/utils.js";
import type {
  ProviderId,
  TranscriptMessage,
} from "../../types.js";
import {
  extractTranscriptText,
  isBoilerplateTitle,
  looksLikeIdOnly,
  normalizeTranscriptTimestamp,
  parseProviderLikeRole,
} from "./normalizers.js";

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

export function parseJsonTranscriptPayload(
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
