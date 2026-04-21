import path from "node:path";
import { readFileHead } from "../../lib/utils.js";
import type { ProviderSessionProbe } from "./types.js";
import {
  detectClaudeRenamedTitle,
  detectSessionTitleFromHead,
  normalizeDetectedTitle,
} from "./title-detection.js";

function inferFormat(filePath: string): "jsonl" | "json" | "unknown" {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".jsonl")) return "jsonl";
  if (lower.endsWith(".json")) return "json";
  return "unknown";
}

export function inferSessionId(filePath: string): string {
  const base = path.basename(filePath);
  const ext = path.extname(base);
  if (!ext) return base;
  return base.slice(0, -ext.length);
}

export function isWorkspaceChatSessionPath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return (
    normalized.includes("/workspaceStorage/") &&
    normalized.endsWith("/chatSessions/chatSessionStore.json")
  );
}

export function isCopilotGlobalSessionLikeFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/").toLowerCase();
  return (
    normalized.endsWith("/prompts.jsonl") ||
    normalized.endsWith("/history.jsonl") ||
    normalized.endsWith("/chat.jsonl") ||
    normalized.endsWith("/sessions.jsonl") ||
    normalized.includes("/github.copilot-chat/") && normalized.endsWith(".json")
  );
}

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
    const likelyTruncatedSingleLine = Buffer.byteLength(head, "utf8") >= 12000 && lineCount <= 2;
    if (likelyTruncatedSingleLine) {
      head = await readFileHead(filePath, 524288);
    }
  }
  const detected = detectSessionTitleFromHead(head, format);
  const claudeRenamedTitle = await detectClaudeRenamedTitle(filePath, format);
  const effectiveDetected = claudeRenamedTitle ?? detected;
  if (!head.trim()) {
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
