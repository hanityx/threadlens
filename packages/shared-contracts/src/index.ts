export const SCHEMA_VERSION = "2026-02-27";

export type ApiEnvelope<T> = {
  ok: boolean;
  schema_version: string;
  data: T | null;
  error: string | null;
};

export type AgentRuntimeState = {
  ts: string;
  python_backend: {
    url: string;
    reachable: boolean;
    latency_ms: number | null;
  };
  process: {
    pid: number;
    uptime_sec: number;
    node: string;
  };
  tmux: {
    has_tmux: boolean;
    sessions: string[];
  };
};

export type BulkThreadAction = "pin" | "unpin" | "archive_local" | "resume_command";

export type BulkThreadActionRequest = {
  action: BulkThreadAction;
  thread_ids: string[];
};

export type BulkThreadActionResult = {
  action: BulkThreadAction;
  total: number;
  success: number;
  failed: number;
  results: Array<{
    thread_id: string;
    ok: boolean;
    status: number;
    error: string | null;
    data?: unknown;
  }>;
};

export type ExecutionGraphNode = {
  id: string;
  label: string;
  kind: "entry" | "config" | "instruction" | "runtime" | "workspace";
  detail?: string;
};

export type ExecutionGraphEdge = {
  from: string;
  to: string;
  reason: string;
};

export type ExecutionGraphData = {
  generated_at: string;
  nodes: ExecutionGraphNode[];
  edges: ExecutionGraphEdge[];
  findings: string[];
  evidence: {
    codex_config_path: string;
    global_state_path: string;
    notify_hook?: string;
    developer_instructions_excerpt?: string;
    trusted_projects: string[];
  };
};
