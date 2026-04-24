import type { ProviderId } from "@threadlens/shared-contracts";

export type { ProviderId } from "@threadlens/shared-contracts";

export type ProviderStatus = "active" | "detected" | "missing";
export type ProviderSessionAction =
  | "backup_local"
  | "archive_local"
  | "unarchive_local"
  | "delete_local";

export type ProviderSessionActionOptions = {
  backup_before_delete?: boolean;
  backup_root?: string;
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
  total_bytes: number;
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
  display_title?: string;
  file_path: string;
  mtime: string;
  match_kind: ConversationSearchMatchKind;
  snippet: string;
  role?: TranscriptMessage["role"];
  source?: string;
};

export type ConversationSearchSessionResult = {
  provider: ProviderId;
  session_id: string;
  thread_id?: string | null;
  title: string;
  display_title?: string;
  file_path: string;
  source?: string;
  mtime: string;
  match_count: number;
  title_match_count: number;
  best_match_kind: ConversationSearchMatchKind;
  preview_matches: ConversationSearchResult[];
  has_more_hits: boolean;
};

export type ConversationSearchPayload = {
  generated_at: string;
  q: string;
  providers: ProviderId[];
  limit: number;
  page_size: number;
  searched_sessions: number;
  available_sessions: number;
  truncated: boolean;
  total_matching_sessions: number | null;
  total_matching_hits: number | null;
  has_more: boolean;
  next_cursor: string | null;
  preview_hits_per_session: number;
  sessions: ConversationSearchSessionResult[];
  results: ConversationSearchResult[];
};

export type ConversationSearchSessionHitsPayload = {
  generated_at: string;
  q: string;
  provider: ProviderId;
  session_id: string;
  file_path?: string;
  page_size: number;
  total_hits: number;
  has_more: boolean;
  next_cursor: string | null;
  hits: ConversationSearchResult[];
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
