export const SCHEMA_VERSION = "2026-02-27";
export { createApiClient, parseApiPayload } from "./api-client.js";

export type ProviderDocsVisibility = "public" | "internal";
export type ProviderSearchScopeVisibility = "public" | "internal" | "none";
export type ProviderTabGroup = "core" | "optional" | "internal";

type ProviderCapabilityDefinition = {
  id: string;
  label: string;
  docs_visibility: ProviderDocsVisibility;
  search_scope_visibility: ProviderSearchScopeVisibility;
  provider_tab_group: ProviderTabGroup;
  thread_review: boolean;
  read_sessions: boolean;
  read_transcript: boolean;
  analyze_context: boolean;
  safe_cleanup: boolean;
  hard_delete: boolean;
};

export const PROVIDER_REGISTRY = [
  {
    id: "codex",
    label: "Codex",
    docs_visibility: "public",
    search_scope_visibility: "public",
    provider_tab_group: "core",
    thread_review: true,
    read_sessions: true,
    read_transcript: true,
    analyze_context: true,
    safe_cleanup: true,
    hard_delete: true,
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    docs_visibility: "internal",
    search_scope_visibility: "internal",
    provider_tab_group: "internal",
    thread_review: false,
    read_sessions: true,
    read_transcript: false,
    analyze_context: true,
    safe_cleanup: false,
    hard_delete: false,
  },
  {
    id: "claude",
    label: "Claude",
    docs_visibility: "public",
    search_scope_visibility: "public",
    provider_tab_group: "core",
    thread_review: false,
    read_sessions: true,
    read_transcript: true,
    analyze_context: true,
    safe_cleanup: true,
    hard_delete: true,
  },
  {
    id: "gemini",
    label: "Gemini",
    docs_visibility: "public",
    search_scope_visibility: "public",
    provider_tab_group: "core",
    thread_review: false,
    read_sessions: true,
    read_transcript: true,
    analyze_context: true,
    safe_cleanup: true,
    hard_delete: true,
  },
  {
    id: "copilot",
    label: "Copilot",
    docs_visibility: "public",
    search_scope_visibility: "public",
    provider_tab_group: "optional",
    thread_review: false,
    read_sessions: true,
    read_transcript: true,
    analyze_context: true,
    safe_cleanup: true,
    hard_delete: true,
  },
] as const satisfies readonly ProviderCapabilityDefinition[];

export type ProviderId = (typeof PROVIDER_REGISTRY)[number]["id"];
export type ProviderCapability = (typeof PROVIDER_REGISTRY)[number];
export type SearchableProviderId = Extract<
  ProviderId,
  (typeof PROVIDER_REGISTRY)[number] extends infer T
    ? T extends { id: infer I extends string; search_scope_visibility: "public" }
      ? I
      : never
    : never
>;

export const PROVIDER_IDS = Object.freeze(
  PROVIDER_REGISTRY.map((provider) => provider.id),
) as readonly ProviderId[];

export const PROVIDER_LABELS = Object.freeze(
  Object.fromEntries(PROVIDER_REGISTRY.map((provider) => [provider.id, provider.label])),
) as Readonly<Record<ProviderId, string>>;

export const SEARCHABLE_PROVIDER_IDS = Object.freeze(
  PROVIDER_REGISTRY.filter((provider) => provider.search_scope_visibility === "public").map(
    (provider) => provider.id,
  ),
) as readonly SearchableProviderId[];

export const SEARCHABLE_PROVIDER_LABELS = Object.freeze(
  Object.fromEntries(SEARCHABLE_PROVIDER_IDS.map((id) => [id, PROVIDER_LABELS[id]])),
) as Readonly<Record<SearchableProviderId, string>>;

export const CORE_PROVIDER_IDS = Object.freeze(
  PROVIDER_REGISTRY.filter((provider) => provider.provider_tab_group === "core").map(
    (provider) => provider.id,
  ),
) as readonly ProviderId[];

export const OPTIONAL_PROVIDER_IDS = Object.freeze(
  PROVIDER_REGISTRY.filter((provider) => provider.provider_tab_group === "optional").map(
    (provider) => provider.id,
  ),
) as readonly ProviderId[];

export const INTERNAL_PROVIDER_IDS = Object.freeze(
  PROVIDER_REGISTRY.filter((provider) => provider.provider_tab_group === "internal").map(
    (provider) => provider.id,
  ),
) as readonly ProviderId[];

const PROVIDER_CAPABILITY_MAP = Object.freeze(
  Object.fromEntries(PROVIDER_REGISTRY.map((provider) => [provider.id, provider])),
) as Readonly<Record<ProviderId, ProviderCapability>>;

export function getProviderCapability(providerId: ProviderId): ProviderCapability {
  return PROVIDER_CAPABILITY_MAP[providerId];
}

export function findProviderCapability(
  providerId: string | null | undefined,
): ProviderCapability | undefined {
  const normalized = String(providerId ?? "").trim().toLowerCase();
  return PROVIDER_CAPABILITY_MAP[normalized as ProviderId];
}

export type ApiEnvelope<T> = {
  ok: boolean;
  schema_version: string;
  data: T | null;
  error: string | null;
};

export type UpdateCheckStatus = {
  source: "github-releases";
  status: "available" | "up-to-date" | "unavailable";
  checked_at: string;
  current_version: string;
  latest_version: string | null;
  release_title: string | null;
  release_summary: string | null;
  has_update: boolean;
  release_url: string;
  error: string | null;
};

export type AgentRuntimeState = {
  ts: string;
  runtime_backend: {
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
  kind: "entry" | "config" | "instruction" | "runtime" | "workspace" | "provider";
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
    providers: Array<{
      provider: string;
      name: string;
      status: "active" | "detected" | "missing";
      capability_level: "full" | "read-only" | "unavailable";
      session_log_count: number;
      roots: string[];
      notes: string;
      capabilities: {
        read_sessions: boolean;
        analyze_context: boolean;
        safe_cleanup: boolean;
        hard_delete: boolean;
      };
    }>;
    data_sources: Array<{
      source_key: string;
      path: string;
      present: boolean;
      file_count?: number;
      dir_count?: number;
      total_bytes?: number;
      latest_mtime?: string | null;
    }>;
  };
};
