import { CORE_PROVIDER_IDS, OPTIONAL_PROVIDER_IDS } from "@threadlens/shared-contracts";
import type { ProviderView } from "../../types";

export { CORE_PROVIDER_IDS, OPTIONAL_PROVIDER_IDS } from "@threadlens/shared-contracts";

export type CsvColumnKey =
  | "provider"
  | "session_id"
  | "title"
  | "title_source"
  | "source"
  | "format"
  | "probe_ok"
  | "size_bytes"
  | "modified"
  | "file_path";

export const CSV_COLUMN_KEYS: CsvColumnKey[] = [
  "provider",
  "session_id",
  "title",
  "title_source",
  "source",
  "format",
  "probe_ok",
  "size_bytes",
  "modified",
  "file_path",
];

export const DEFAULT_CSV_COLUMNS: Record<CsvColumnKey, boolean> = {
  provider: true,
  session_id: true,
  title: true,
  title_source: true,
  source: true,
  format: true,
  probe_ok: true,
  size_bytes: true,
  modified: true,
  file_path: true,
};

export const COMPACT_CSV_COLUMNS: Record<CsvColumnKey, boolean> = {
  provider: true,
  session_id: true,
  title: true,
  title_source: false,
  source: false,
  format: true,
  probe_ok: true,
  size_bytes: true,
  modified: true,
  file_path: true,
};

export const FORENSICS_CSV_COLUMNS: Record<CsvColumnKey, boolean> = {
  provider: true,
  session_id: true,
  title: true,
  title_source: false,
  source: true,
  format: true,
  probe_ok: true,
  size_bytes: true,
  modified: true,
  file_path: true,
};

export const SLOW_THRESHOLD_OPTIONS_MS = [800, 1200, 1600, 2200, 3000];
const PROVIDER_CSV_COLUMNS_STORAGE_KEY = "po-provider-csv-columns";
const LEGACY_PROVIDER_CSV_COLUMNS_STORAGE_KEY = "cmc-provider-csv-columns";
const HOME_PATH_MARKER = `/${"Users"}/`;
const MARKDOWN_FILE_NAME_PATTERN = /\b[\w.-]+\.md\b/i;

function readStorageValue(keys: readonly string[]): string | null {
  if (typeof window === "undefined") return null;
  try {
    for (const key of keys) {
      const value = window.localStorage.getItem(key);
      if (value !== null) return value;
    }
  } catch {
    return null;
  }
  return null;
}

function writeStorageValue(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage persistence failures
  }
}

export function writeCsvColumnPrefs(columns: Record<CsvColumnKey, boolean>): void {
  writeStorageValue(PROVIDER_CSV_COLUMNS_STORAGE_KEY, JSON.stringify(columns));
}

export function clearSlowOnlyPref(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem("po-provider-slow-only");
    window.localStorage.removeItem("cmc-provider-slow-only");
  } catch {
    // ignore storage persistence failures
  }
}

export function csvCell(value: unknown): string {
  const raw = String(value ?? "");
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, "\"\"")}"`;
  }
  return raw;
}

export function formatBytes(value: number): string {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[idx]}`;
}

export function formatBytesCompact(value: number): string {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0B";
  if (bytes < 1024) return `${Math.round(bytes)}B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let idx = 0;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  const digits = size >= 10 ? 0 : 1;
  return `${size.toFixed(digits)}${units[idx]}`;
}

export function formatFetchMs(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return `${Math.max(0, Math.round(value))}ms`;
}

export function compactSessionTitle(title?: string | null, sessionId?: string | null): string {
  const normalized = String(title || "").trim();
  const fallbackId = String(sessionId || "").trim();
  const fallbackLabel = fallbackId
    ? `session ${/^\d{4}-\d{2}-/.test(fallbackId) ? fallbackId.slice(-8) : fallbackId.slice(0, 8)}`
    : "session";
  if (!normalized || normalized === "none") {
    return fallbackLabel;
  }
  const lower = normalized.toLowerCase();
  const looksGenerated =
    lower.startsWith("rollout-") ||
    MARKDOWN_FILE_NAME_PATTERN.test(normalized) ||
    normalized.includes("<INSTRUCTIONS>") ||
    normalized.includes(HOME_PATH_MARKER) ||
    normalized.length > 72;
  return looksGenerated ? fallbackLabel : normalized;
}

export function compactSessionId(sessionId?: string | null): string {
  if (!sessionId) return "session";
  if (sessionId.length <= 18) return sessionId;
  return `${sessionId.slice(0, 8)}…${sessionId.slice(-4)}`;
}

export function compactSessionFileName(fileName?: string | null): string {
  const normalized = String(fileName || "").trim();
  if (!normalized) return "";
  if (normalized.length <= 34) return normalized;
  const extensionMatch = normalized.match(/(\.[a-z0-9]+)$/i);
  const extension = extensionMatch?.[1] ?? "";
  const stem = extension ? normalized.slice(0, -extension.length) : normalized;
  if (stem.length <= 26) return normalized;
  const suffixLength = extension ? 6 : 4;
  const suffix = stem.slice(-suffixLength).replace(/^[-_.]+/, "");
  return `${stem.slice(0, 24)}…${suffix}${extension}`;
}

export function suppressMouseFocus(event: { detail: number; preventDefault: () => void }): void {
  if (event.detail > 0) {
    event.preventDefault();
  }
}

export function readCsvColumnPrefs(): Record<CsvColumnKey, boolean> {
  if (typeof window === "undefined") return DEFAULT_CSV_COLUMNS;
  try {
    const raw = readStorageValue([
      PROVIDER_CSV_COLUMNS_STORAGE_KEY,
      LEGACY_PROVIDER_CSV_COLUMNS_STORAGE_KEY,
    ]);
    if (!raw) return DEFAULT_CSV_COLUMNS;
    const parsed = JSON.parse(raw) as Partial<Record<CsvColumnKey, boolean>>;
    const next: Record<CsvColumnKey, boolean> = { ...DEFAULT_CSV_COLUMNS };
    CSV_COLUMN_KEYS.forEach((key) => {
      if (typeof parsed[key] === "boolean") next[key] = parsed[key] as boolean;
    });
    return next;
  } catch {
    return DEFAULT_CSV_COLUMNS;
  }
}

export function dataSourceLabel(sourceKey: string): string {
  const key = sourceKey.toLowerCase();
  if (key === "history") return "History";
  if (key === "global_state") return "Global state";
  if (key === "sessions") return "Sessions";
  if (key === "archived_sessions") return "Archived sessions";
  if (key === "codex_root") return "Codex root";
  if (key === "chat_root") return "Chat root";
  if (key === "claude_root") return "Claude root";
  if (key === "claude_projects") return "Claude projects";
  if (key === "claude_transcripts") return "Claude transcripts";
  if (key === "gemini_root") return "Gemini root";
  if (key === "gemini_tmp") return "Gemini temp";
  if (key === "gemini_history") return "Gemini history";
  if (key === "gemini_antigravity") return "Gemini conversations";
  if (key === "copilot_vscode") return "Copilot VS Code";
  if (key === "copilot_cursor") return "Copilot Cursor";
  if (key === "copilot_vscode_workspace") return "Copilot VS Code workspace";
  if (key === "copilot_cursor_workspace") return "Copilot Cursor workspace";
  return sourceKey.replace(/_/g, " ").replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

export function providerFromDataSource(sourceKey: string): ProviderView | null {
  const key = sourceKey.toLowerCase();
  if (key.startsWith("claude")) return "claude";
  if (key.startsWith("gemini")) return "gemini";
  if (key.startsWith("copilot")) return "copilot";
  if (key.startsWith("chat_")) return "chatgpt";
  if (
    key.startsWith("codex_") ||
    key === "sessions" ||
    key === "archived_sessions" ||
    key === "history" ||
    key === "global_state"
  ) {
    return "codex";
  }
  return null;
}
