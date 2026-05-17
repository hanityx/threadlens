import { readFile } from "node:fs/promises";
import { readFileTail } from "../../lib/utils.js";
import type {
  ProviderId,
  TranscriptPayload,
} from "./types.js";
import {
  parseJsonTranscriptPayload,
} from "./transcripts/json.js";
import {
  parseJsonlTranscriptLines,
} from "./transcripts/jsonl.js";
import {
  extractCodexThreadIdFromSessionName,
  inferFormat,
  inferSessionId,
} from "./transcripts/normalizers.js";

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
  let lines = tail.text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  let messages = parseJsonlTranscriptLines(lines);

  if (tail.truncated && safeLimit > messages.length) {
    const fullRaw = await readFile(filePath, "utf-8").catch(() => "");
    if (fullRaw) {
      lines = fullRaw
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      messages = parseJsonlTranscriptLines(lines);
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
