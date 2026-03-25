import type { ApiEnvelope } from "@threadlens/shared-contracts";

export type SearchHit = {
  provider: string;
  session_id: string;
  thread_id?: string | null;
  title?: string;
  display_title?: string;
  file_path: string;
  mtime: string;
  match_kind: "title" | "message";
  snippet: string;
  role?: string | null;
  source?: string;
};

export type SearchResponse = ApiEnvelope<{
  generated_at?: string;
  q?: string;
  providers?: string[];
  searched_sessions?: number;
  available_sessions?: number;
  truncated?: boolean;
  results?: SearchHit[];
}>;

export type ProviderSessionRow = {
  provider: string;
  source: string;
  session_id: string;
  display_title: string;
  file_path: string;
  size_bytes: number;
  mtime: string;
  probe: {
    ok: boolean;
    format: "jsonl" | "json" | "unknown";
    error: string | null;
    detected_title: string;
    title_source: string | null;
  };
};

export type ProviderSessionsResponse = ApiEnvelope<{
  summary?: {
    providers: number;
    rows: number;
    parse_ok: number;
    parse_fail: number;
  };
  providers?: ProviderScanEntry[];
  rows?: ProviderSessionRow[];
}>;

export type ProviderScanEntry = {
  provider: string;
  name: string;
  status: "active" | "detected" | "missing";
  scanned: number;
  truncated: boolean;
  scan_ms?: number;
};

export type TranscriptMessage = {
  idx: number;
  role: "user" | "assistant" | "developer" | "system" | "tool" | "unknown";
  text: string;
  ts: string | null;
  source_type: string;
};

export type TranscriptResponse = ApiEnvelope<{
  provider: string;
  thread_id: string | null;
  file_path: string;
  scanned_lines: number;
  message_count: number;
  truncated: boolean;
  messages: TranscriptMessage[];
}>;

export type ThreadRow = {
  id?: string;
  thread_id: string;
  title: string;
  title_source?: string;
  risk_score: number;
  is_pinned: boolean;
  source: string;
  project_bucket?: string;
  cwd?: string;
  timestamp?: string;
  activity_status?: string;
  risk_level?: string;
  risk_tags?: string[];
};

export type ThreadsResponse = ApiEnvelope<{
  rows?: ThreadRow[];
  total?: number;
  source?: string;
}>;

export type AnalyzeDeleteResponse = ApiEnvelope<{
  count?: number;
  reports?: Array<{
    id: string;
    exists: boolean;
    title?: string;
    risk_level?: string;
    risk_score?: number;
    summary?: string;
    parents?: string[];
    impacts?: string[];
  }>;
}>;

export type CleanupPreviewResponse = ApiEnvelope<{
  ok?: boolean;
  mode?: string;
  confirm_token_expected?: string;
  target_file_count?: number;
  requested_ids?: number;
  confirm_help?: string;
  deleted_file_count?: number;
  failed?: Array<{ path: string; error: string }>;
  backup?: {
    backup_dir?: string;
    copied_count?: number;
  };
}>;

export type ProviderActionResponse = ApiEnvelope<{
  ok: boolean;
  provider: string;
  action: "backup_local" | "archive_local" | "delete_local";
  dry_run: boolean;
  target_count: number;
  valid_count: number;
  applied_count: number;
  confirm_token_expected: string;
  confirm_token_accepted: boolean;
  backup_before_delete?: boolean;
  backed_up_count?: number;
  backup_to?: string | null;
  backup_manifest_path?: string | null;
  skipped?: Array<{ file_path: string; reason: string }>;
  archived_to?: string | null;
  mode?: string;
  error?: string;
}>;
