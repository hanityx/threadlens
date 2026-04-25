import { createApiClient, type UpdateCheckStatus } from "@threadlens/shared-contracts";
import type {
  AnalyzeDeleteResponse,
  CleanupPreviewResponse,
  ProviderActionResponse,
  ProviderSessionsResponse,
  SearchResponse,
  ThreadsResponse,
  TranscriptResponse,
} from "./types.js";
import { DEFAULT_PROVIDER_SESSIONS_LIMIT } from "./lib/sessionFetchWindow.js";

const API_BASE_URL = process.env.THREADLENS_API_URL ?? "http://127.0.0.1:8788";
const client = createApiClient({
  resolveBaseUrl: () => API_BASE_URL,
  unwrapEnvelope: true,
  errorMode: "simple",
});

export const apiGet = client.apiGet;
export const apiPost = client.apiPost;

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export async function fetchUpdateCheck(): Promise<UpdateCheckStatus> {
  return apiGet("/api/update-check");
}

export async function searchConversations(
  query: string,
  provider: string,
  cursor?: string | null,
): Promise<NonNullable<SearchResponse["data"]>> {
  const providerQuery = provider === "all" ? "" : `&provider=${encodeURIComponent(provider)}`;
  const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
  return apiGet(
    `/api/conversation-search?q=${encodeURIComponent(query)}&page_size=40&preview_hits_per_session=3${providerQuery}${cursorQuery}`,
  );
}

export async function listProviderSessions(
  provider: string,
  refresh = false,
  limit = DEFAULT_PROVIDER_SESSIONS_LIMIT,
): Promise<NonNullable<ProviderSessionsResponse["data"]>> {
  const providerQuery = provider === "all" ? "" : `&provider=${encodeURIComponent(provider)}`;
  const refreshQuery = refresh ? "&refresh=1" : "";
  return apiGet(`/api/provider-sessions?limit=${limit}${providerQuery}${refreshQuery}`);
}

export async function loadSessionTranscript(
  provider: string,
  filePath: string,
  limit = 120,
): Promise<NonNullable<TranscriptResponse["data"]>> {
  return apiGet(
    `/api/session-transcript?provider=${encodeURIComponent(provider)}&file_path=${encodeURIComponent(filePath)}&limit=${limit}`,
  );
}

export async function backupSession(
  provider: string,
  filePaths: string[],
): Promise<NonNullable<ProviderActionResponse["data"]>> {
  return runProviderAction(provider, "backup_local", filePaths, {
    dryRun: false,
  });
}

export async function runProviderAction(
  provider: string,
  action: "backup_local" | "archive_local" | "unarchive_local" | "delete_local",
  filePaths: string[],
  options?: {
    dryRun?: boolean;
    confirmToken?: string;
    backupBeforeDelete?: boolean;
  },
): Promise<NonNullable<ProviderActionResponse["data"]>> {
  return apiPost("/api/provider-session-action", {
    provider,
    action,
    file_paths: filePaths,
    dry_run: options?.dryRun ?? true,
    confirm_token: options?.confirmToken ?? "",
    backup_before_delete: options?.backupBeforeDelete ?? false,
  });
}

export async function listThreads(limit = 240): Promise<NonNullable<ThreadsResponse["data"]>> {
  return apiGet(`/api/threads?offset=0&limit=${limit}&q=&sort=updated_desc`);
}

export async function analyzeDelete(ids: string[]): Promise<NonNullable<AnalyzeDeleteResponse["data"]>> {
  return apiPost("/api/analyze-delete", { ids });
}

export async function cleanupDryRun(ids: string[]): Promise<NonNullable<CleanupPreviewResponse["data"]>> {
  return apiPost("/api/local-cleanup", {
    ids,
    dry_run: true,
    confirm_token: "",
    options: {
      delete_cache: true,
      delete_session_logs: true,
      clean_state_refs: true,
    },
  });
}

export async function cleanupApply(
  ids: string[],
  confirmToken: string,
): Promise<NonNullable<CleanupPreviewResponse["data"]>> {
  return apiPost("/api/local-cleanup", {
    ids,
    dry_run: false,
    confirm_token: confirmToken,
    options: {
      delete_cache: true,
      delete_session_logs: true,
      clean_state_refs: true,
    },
  });
}
