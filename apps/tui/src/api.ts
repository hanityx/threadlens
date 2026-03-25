import type { ApiEnvelope } from "@threadlens/shared-contracts";
import type {
  AnalyzeDeleteResponse,
  CleanupPreviewResponse,
  ProviderActionResponse,
  ProviderSessionsResponse,
  SearchResponse,
  ThreadsResponse,
  TranscriptResponse,
} from "./types.js";

const API_BASE_URL = process.env.THREADLENS_API_URL ?? "http://127.0.0.1:8788";

async function parseEnvelope<T>(response: Response, path: string): Promise<T> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`${path} returned invalid JSON`);
  }

  if (!response.ok) {
    if (
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as { error?: unknown }).error === "string"
    ) {
      throw new Error((payload as { error: string }).error);
    }
    throw new Error(`${path} failed with status ${response.status}`);
  }

  if (
    payload &&
    typeof payload === "object" &&
    "ok" in payload &&
    typeof (payload as { ok?: unknown }).ok === "boolean" &&
    "data" in payload
  ) {
    const envelope = payload as ApiEnvelope<T>;
    if (!envelope.ok || envelope.data == null) {
      throw new Error(envelope.error || `${path} failed`);
    }
    return envelope.data;
  }

  return payload as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  return parseEnvelope<T>(response, path);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return parseEnvelope<T>(response, path);
}

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export async function searchConversations(
  query: string,
  provider: string,
): Promise<NonNullable<SearchResponse["data"]>> {
  const providerQuery = provider === "all" ? "" : `&provider=${encodeURIComponent(provider)}`;
  return apiGet(`/api/conversation-search?q=${encodeURIComponent(query)}&limit=120${providerQuery}`);
}

export async function listProviderSessions(
  provider: string,
  refresh = false,
): Promise<NonNullable<ProviderSessionsResponse["data"]>> {
  const providerQuery = provider === "all" ? "" : `&provider=${encodeURIComponent(provider)}`;
  const refreshQuery = refresh ? "&refresh=1" : "";
  return apiGet(`/api/provider-sessions?limit=80${providerQuery}${refreshQuery}`);
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
  action: "backup_local" | "archive_local" | "delete_local",
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

export async function listThreads(): Promise<NonNullable<ThreadsResponse["data"]>> {
  return apiGet("/api/threads?offset=0&limit=80&q=&sort=updated_desc");
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
