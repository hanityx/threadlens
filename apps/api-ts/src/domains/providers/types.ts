import type { ProviderId } from "@threadlens/shared-contracts";

export type { ProviderId } from "@threadlens/shared-contracts";

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

export type ProviderMatrixData = {
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
