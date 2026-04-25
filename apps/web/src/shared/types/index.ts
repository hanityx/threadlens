import type { ApiEnvelope, ExecutionGraphData } from "@threadlens/shared-contracts";

export type TranscriptMessage = {
  idx: number;
  role: "user" | "assistant" | "developer" | "system" | "tool" | "unknown";
  text: string;
  ts: string | null;
  source_type: string;
};

/* ── Runtime ──────────────────────────────────────────── */
export type RuntimeEnvelope = ApiEnvelope<{
  runtime_backend: { reachable: boolean; latency_ms: number | null; url: string };
  process: { pid: number; uptime_sec: number; node: string };
  tmux: { sessions: string[] };
}>;

export type SmokeStatusEnvelope = ApiEnvelope<{
  generated_at?: string;
  summary_dir?: string;
  latest?: {
    status?: "pass" | "fail" | "missing" | "invalid";
    result?: "PASS" | "FAIL" | "MISSING" | "INVALID";
    ok?: boolean;
    timestamp_utc?: string;
    age_sec?: number | null;
    path?: string;
    sources?: {
      perf_report?: string;
      forensics_report?: string;
    };
    perf?: {
      ok?: boolean;
      agent_runtime_sec?: number | null;
      provider_sessions_30_sec?: number | null;
      threads_60_sec?: number | null;
      threads_160_sec?: number | null;
    };
    forensics?: {
      result?: string;
      analyze_status?: number | null;
      cleanup_status?: number | null;
      cleanup_token_valid?: boolean | null;
    };
    parse_error?: string;
  };
  history?: Array<{
    timestamp_utc?: string;
    path?: string;
  }>;
}>;

/* ── Threads ──────────────────────────────────────────── */
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
  activity_age_min?: number;
  risk_level?: string;
  risk_tags?: string[];
  session_line_count?: number;
  session_tool_calls?: number;
  session_bytes?: number;
  session_format_ok?: boolean | null;
  context_score?: number;
  has_local_data?: boolean;
  has_session_log?: boolean;
  local_cache_paths?: string[];
};

export type ThreadsResponse = {
  rows?: ThreadRow[];
  total?: number;
  schema_version?: string;
};

/* ── Recovery ─────────────────────────────────────────── */
export type RecoveryResponse = {
  default_backup_root?: string;
  default_export_root?: string;
  backup_root?: string;
  backup_total?: number;
  backup_sets?: Array<{
    backup_id: string;
    path: string;
    file_count: number;
    total_bytes: number;
    latest_mtime: string;
    sample_files?: string[];
  }>;
  legacy_backup_sets?: Array<{
    backup_id: string;
    path: string;
    file_count: number;
    total_bytes: number;
    latest_mtime: string;
    sample_files?: string[];
  }>;
  plan_root?: string;
  summary?: { backup_sets: number; checklist_done: number; checklist_total: number };
  generated_at?: string;
};

/* ── Data Sources ─────────────────────────────────────── */
export type DataSourcesEnvelope = ApiEnvelope<{
  generated_at?: string;
  sources?: Record<string, Record<string, unknown>>;
}>;

export type DataSourceInventoryRow = {
  source_key: string;
  path: string;
  present: boolean;
  file_count: number;
  dir_count: number;
  total_bytes: number;
  latest_mtime: string;
};

/* ── Provider Matrix ──────────────────────────────────── */
export type ProviderMatrixProvider = {
  provider: string;
  name: string;
  status: "active" | "detected" | "missing";
  capability_level: "full" | "read-only" | "unavailable";
  capabilities: {
    read_sessions: boolean;
    analyze_context: boolean;
    safe_cleanup: boolean;
    hard_delete: boolean;
  };
  evidence?: {
    session_log_count?: number;
    notes?: string;
    roots?: string[];
  };
};

export type ProviderMatrixEnvelope = ApiEnvelope<{
  summary?: {
    total: number;
    active: number;
    detected: number;
    read_analyze_ready: number;
    safe_cleanup_ready: number;
    hard_delete_ready: number;
  };
  providers?: ProviderMatrixProvider[];
}>;

/* ── Provider Sessions ────────────────────────────────── */
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

export type ProviderSessionsEnvelope = ApiEnvelope<{
  summary?: {
    providers: number;
    rows: number;
    parse_ok: number;
    parse_fail: number;
  };
  providers?: Array<{
    provider: string;
    name: string;
    status: "active" | "detected" | "missing";
    scanned: number;
    truncated: boolean;
    scan_ms?: number;
    total_bytes?: number;
  }>;
  rows?: ProviderSessionRow[];
}>;

/* ── Parser Health ────────────────────────────────────── */
export type ProviderParserHealthEnvelope = ApiEnvelope<{
  summary?: {
    providers: number;
    scanned: number;
    parse_ok: number;
    parse_fail: number;
    parse_score: number | null;
  };
  reports?: ProviderParserHealthReport[];
}>;

export type ProviderParserHealthReport = {
  provider: string;
  name: string;
  status: "active" | "detected" | "missing";
  scanned: number;
  parse_ok: number;
  parse_fail: number;
  parse_score: number | null;
  truncated: boolean;
  scan_ms?: number;
  sample_errors?: Array<{
    session_id: string;
    format: string;
    error: string | null;
  }>;
};

/* ── Provider Session Action ──────────────────────────── */
export type ProviderSessionActionResult = {
  ok: boolean;
  provider: string;
  action: "backup_local" | "archive_local" | "unarchive_local" | "delete_local";
  dry_run: boolean;
  target_count: number;
  valid_count: number;
  applied_count: number;
  confirm_token_expected: string;
  confirm_token_accepted: boolean;
  selection_fingerprint?: string;
  backup_before_delete?: boolean;
  backed_up_count?: number;
  backup_id?: string | null;
  backup_ids?: string[];
  backup_to?: string | null;
  backup_manifest_path?: string | null;
  backup_summary?: {
    destination?: string | null;
    manifest_path?: string | null;
    copied_count: number;
    failed_count: number;
  } | null;
  failure_summary?: {
    skipped_count: number;
    failed_count: number;
    partial_failure: boolean;
  };
  skipped?: Array<{ file_path: string; reason: string }>;
  archived_to?: string | null;
  mode?: string;
  error?: string;
};

export type ProviderActionSelection = {
  provider: string;
  action: "backup_local" | "archive_local" | "unarchive_local" | "delete_local";
  file_paths: string[];
  dry_run: boolean;
  backup_before_delete?: boolean;
  backup_root?: string;
};

export type RecoveryBackupExportResponse = {
  ok: boolean;
  generated_at?: string;
  backup_root?: string;
  export_root?: string;
  export_dir?: string;
  archive_path?: string;
  download_token?: string;
  manifest_path?: string;
  selected_backup_ids?: string[];
  missing_backup_ids?: string[];
  exported_count?: number;
  exported_sets?: Array<{
    backup_id: string;
    source_path: string;
    export_path: string;
    file_count: number;
    total_bytes: number;
    latest_mtime: string;
  }>;
  error?: string;
};

/* ── Analyze / Forensics ──────────────────────────────── */
export type AnalyzeDeleteReport = {
  id: string;
  exists: boolean;
  title?: string;
  risk_level?: string;
  risk_score?: number;
  summary?: string;
  parents?: string[];
  impacts?: string[];
  cross_session_links?: {
    strong_links: number;
    mention_links: number;
    related_threads: number;
    strong_samples: Array<{
      thread_id: string;
      title?: string;
      direction: "outbound" | "inbound" | "both";
      strength: "strong" | "mention";
      evidence_kind:
        | "parent_thread_id"
        | "forked_from_id"
        | "new_thread_id"
        | "command_output"
        | "tool_output"
        | "search_text"
        | "copied_context"
        | "generic_mention";
      matched_field?: string;
      matched_event?: string;
      matched_value?: string;
      matched_excerpt?: string;
    }>;
    mention_samples: Array<{
      thread_id: string;
      title?: string;
      direction: "outbound" | "inbound" | "both";
      strength: "strong" | "mention";
      evidence_kind:
        | "parent_thread_id"
        | "forked_from_id"
        | "new_thread_id"
        | "command_output"
        | "tool_output"
        | "search_text"
        | "copied_context"
        | "generic_mention";
      matched_field?: string;
      matched_event?: string;
      matched_value?: string;
      matched_excerpt?: string;
    }>;
    related_samples: Array<{
      thread_id: string;
      title?: string;
      direction: "outbound" | "inbound" | "both";
      strength: "strong" | "mention";
      evidence_kind:
        | "parent_thread_id"
        | "forked_from_id"
        | "new_thread_id"
        | "command_output"
        | "tool_output"
        | "search_text"
        | "copied_context"
        | "generic_mention";
      matched_field?: string;
      matched_event?: string;
      matched_value?: string;
      matched_excerpt?: string;
    }>;
  };
};

export type AnalyzeDeleteData = {
  count?: number;
  reports?: AnalyzeDeleteReport[];
  session_scan_limit?: number;
  session_scan_candidates?: number;
};

export type ThreadCleanupOptions = {
  delete_cache?: boolean;
  delete_session_logs?: boolean;
  clean_state_refs?: boolean;
};

export type CleanupPendingState = {
  ids: string[];
  confirmToken: string;
  selectionKey: string;
  options: ThreadCleanupOptions;
};

export type CleanupTarget = {
  kind?: string;
  thread_id?: string;
  path: string;
};

export type CleanupFailure = {
  path: string;
  error: string;
};

export type CleanupStateResult = {
  changed?: boolean;
  removed?: {
    titles?: number;
    order?: number;
    pinned?: number;
  };
  path?: string;
};

export type ThreadForensicsEnvelope = {
  count?: number;
  reports?: Array<{
    id: string;
    title?: string;
    title_source?: string;
    cwd?: string;
    summary?: string;
    artifact_count?: number;
    artifact_count_by_kind?: Record<string, number>;
    artifact_paths_preview?: string[];
    impact?: {
      risk_level?: string;
      risk_score?: number;
      parents?: string[];
      summary?: string;
    };
  }>;
};

export type CleanupPreviewData = {
  ok?: boolean;
  mode?: string;
  confirm_token_expected?: string;
  target_file_count?: number;
  requested_ids?: number;
  confirm_help?: string;
  deleted_file_count?: number;
  backup?: {
    backup_dir?: string;
    copied_count?: number;
  };
  failed?: CleanupFailure[];
  state_result?: CleanupStateResult;
  targets?: CleanupTarget[];
  error?: string;
};

/* ── Transcript ───────────────────────────────────────── */
export type TranscriptPayload = {
  provider: string;
  thread_id: string | null;
  file_path: string;
  scanned_lines: number;
  message_count: number;
  truncated: boolean;
  messages: TranscriptMessage[];
};

export type ConversationSearchHit = {
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

export type ConversationSearchSession = {
  provider: string;
  session_id: string;
  thread_id?: string | null;
  title: string;
  display_title?: string;
  file_path: string;
  source?: string;
  mtime: string;
  match_count: number;
  title_match_count: number;
  best_match_kind: "title" | "message";
  preview_matches: ConversationSearchHit[];
  has_more_hits: boolean;
};

export type ConversationSearchEnvelope = ApiEnvelope<{
  generated_at?: string;
  q?: string;
  providers?: string[];
  page_size?: number;
  searched_sessions?: number;
  available_sessions?: number;
  truncated?: boolean;
  total_matching_sessions?: number;
  total_matching_hits?: number;
  has_more?: boolean;
  next_cursor?: string | null;
  preview_hits_per_session?: number;
  sessions?: ConversationSearchSession[];
  results?: ConversationSearchHit[];
}>;

export type ConversationSearchSessionHitsEnvelope = ApiEnvelope<{
  generated_at?: string;
  q?: string;
  provider?: string;
  session_id?: string;
  file_path?: string;
  page_size?: number;
  total_hits?: number;
  has_more?: boolean;
  next_cursor?: string | null;
  hits?: ConversationSearchHit[];
}>;

/* ── UI State ─────────────────────────────────────────── */
export type FilterMode = "all" | "high-risk" | "pinned";
export type ThreadSort =
  | "updated_desc"
  | "updated_asc"
  | "risk_desc"
  | "risk_asc"
  | "activity_desc"
  | "activity_asc"
  | "cwd_desc"
  | "cwd_asc"
  | "pinned_desc"
  | "pinned_asc";
export type ProviderView = "all" | (string & {});
export type ProviderDataDepth = "fast" | "balanced" | "deep";
export type LayoutView = "overview" | "search" | "threads" | "providers";
export type { Locale } from "@/i18n/types";
export type UiDensity = "comfortable" | "compact";

export type ExecutionGraphEnvelope = ApiEnvelope<ExecutionGraphData>;

/* ── Constants ────────────────────────────────────────── */
export const PAGE_SIZE = 160;
export const INITIAL_CHUNK = 80;
export const CHUNK_SIZE = 80;
export const SKELETON_ROWS = 8;
