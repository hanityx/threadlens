import { apiPost, apiPostJsonAllowError } from "../api";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const THREADS_BOOTSTRAP_CACHE_KEY = "po-threads-cache-v1";
export const LEGACY_THREADS_BOOTSTRAP_CACHE_KEY = "cmc-threads-cache-v1";
export const THREADS_FAST_BOOT_LIMIT = 80;
export const SLOW_PROVIDER_SCAN_MS_DEFAULT = 1200;
export const SLOW_PROVIDER_SCAN_MS_MIN = 400;
export const SLOW_PROVIDER_SCAN_MS_MAX = 6000;
export const SLOW_PROVIDER_SCAN_MS_STORAGE_KEY = "po-slow-provider-threshold-ms";
export const LEGACY_SLOW_PROVIDER_SCAN_MS_STORAGE_KEY = "cmc-slow-provider-threshold-ms";
export const THEME_STORAGE_KEY = "po-theme";
export const LEGACY_THEME_STORAGE_KEY = "cmc-theme";
export const DENSITY_STORAGE_KEY = "po-density";
export const LEGACY_DENSITY_STORAGE_KEY = "cmc-density";
export const LAYOUT_VIEW_STORAGE_KEY = "po-layout-view";
export const LEGACY_LAYOUT_VIEW_STORAGE_KEY = "cmc-layout-view";
export const PROVIDER_VIEW_STORAGE_KEY = "po-provider-view";
export const LEGACY_PROVIDER_VIEW_STORAGE_KEY = "cmc-provider-view";
export const PROVIDER_DEPTH_STORAGE_KEY = "po-provider-depth";
export const LEGACY_PROVIDER_DEPTH_STORAGE_KEY = "cmc-provider-depth";
export const SEARCH_DRAFT_STORAGE_KEY = "po-search-draft";
export const SEARCH_PROVIDER_STORAGE_KEY = "po-search-provider";
export const FORENSICS_RETRY_DELAY_MS = 450;
export const RUNTIME_BACKEND_DOWN_CACHED = "runtime-backend-down-cached";
export const THREAD_CLEANUP_DEFAULT_OPTIONS = {
  delete_cache: true,
  delete_session_logs: true,
  clean_state_refs: true,
} as const;

export type ProviderFetchMetrics = {
  data_sources: number | null;
  matrix: number | null;
  sessions: number | null;
  parser: number | null;
};

/* ------------------------------------------------------------------ */
/*  Pure helpers                                                       */
/* ------------------------------------------------------------------ */

export function providerActionSelectionKey(
  provider: string,
  action: "backup_local" | "archive_local" | "delete_local",
  filePaths: string[],
  options?: { backup_before_delete?: boolean },
): string {
  const normalized = Array.from(
    new Set(filePaths.map((item) => String(item || "").trim()).filter(Boolean)),
  ).sort();
  const backupBeforeDelete = options?.backup_before_delete ? "backup-first" : "direct";
  return `${provider}|${action}|${backupBeforeDelete}|${normalized.join("||")}`;
}

export function pruneProviderSelectionForView(
  selectedProviderFiles: Record<string, boolean>,
  providerView: string,
  visibleFilePaths: string[],
): Record<string, boolean> {
  if (providerView === "all") return selectedProviderFiles;

  const visible = new Set(
    visibleFilePaths.map((item) => String(item || "").trim()).filter(Boolean),
  );
  let changed = false;
  const next: Record<string, boolean> = {};

  for (const [filePath, selected] of Object.entries(selectedProviderFiles)) {
    if (!selected) continue;
    if (visible.has(filePath)) {
      next[filePath] = true;
      continue;
    }
    changed = true;
  }

  return changed ? next : selectedProviderFiles;
}

export function normalizeThreadIds(threadIds: string[]): string[] {
  return Array.from(
    new Set(threadIds.map((item) => String(item || "").trim()).filter(Boolean)),
  ).slice(0, 500);
}

export function buildThreadCleanupSelectionKey(
  threadIds: string[],
  options?: {
    delete_cache?: boolean;
    delete_session_logs?: boolean;
    clean_state_refs?: boolean;
  },
): string {
  const ids = normalizeThreadIds(threadIds).sort();
  const normalizedOptions = {
    delete_cache: options?.delete_cache !== false,
    delete_session_logs: options?.delete_session_logs !== false,
    clean_state_refs: options?.clean_state_refs !== false,
  };
  return `${ids.join("||")}::${JSON.stringify(normalizedOptions)}`;
}

export function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export function readStorageValue(keys: readonly string[]): string | null {
  if (typeof window === "undefined") return null;
  for (const key of keys) {
    const value = window.localStorage.getItem(key);
    if (value !== null) return value;
  }
  return null;
}

export function writeStorageValue(key: string, value: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
}

export function isTransientBackendError(raw: string): boolean {
  const normalized = String(raw || "").toLowerCase();
  return (
    normalized.includes("python-backend-unreachable") ||
    normalized.includes("legacy-backend-unreachable") ||
    normalized.includes("runtime-backend-unreachable") ||
    normalized.includes(RUNTIME_BACKEND_DOWN_CACHED) ||
    normalized.includes("status 502") ||
    normalized.includes("status 503") ||
    normalized.includes("fetch failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("socket hang up") ||
    normalized.includes("econnrefused") ||
    normalized.includes("etimedout")
  );
}

export async function postWithTransientRetry<T>(
  path: string,
  body: unknown,
): Promise<T> {
  const retryDelaysMs = [FORENSICS_RETRY_DELAY_MS, FORENSICS_RETRY_DELAY_MS * 2];
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      return await apiPost<T>(path, body);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!isTransientBackendError(message) || attempt >= retryDelaysMs.length) {
        throw error;
      }
      await new Promise<void>((resolve) =>
        setTimeout(resolve, retryDelaysMs[attempt] ?? FORENSICS_RETRY_DELAY_MS),
      );
    }
  }
  throw new Error("transient-retry-exhausted");
}

export function formatMutationErrorMessage(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const normalized = trimmed
    .replace(/^\/api\/[^\s]+\s+status\s+\d+:\s*/i, "")
    .trim();

  if (
    normalized.includes("python-backend-unreachable") ||
    normalized.includes("legacy-backend-unreachable") ||
    normalized.includes("runtime-backend-unreachable") ||
    normalized.includes("status 502") ||
    normalized.includes("status 503") ||
    normalized.includes("fetch failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes(RUNTIME_BACKEND_DOWN_CACHED)
  ) {
    return "The runtime connection is unstable, so the request failed. Check `pnpm --filter @threadlens/api dev` and try again.";
  }

  if (
    normalized.includes("no-valid-thread-ids") ||
    normalized.includes("no thread ids provided") ||
    normalized.includes("at least 1")
  ) {
    return "No valid thread ID is selected. Select at least one and try again.";
  }

  if (normalized.includes("confirm_token")) {
    return "The confirm token is invalid. Run the dry-run again and retry with the latest token.";
  }

  if (normalized.includes("cleanup-selection-changed")) {
    return "The selected threads changed. Run cleanup dry-run again for the current selection.";
  }

  if (normalized.includes("cleanup-preview-required")) {
    return "Run cleanup dry-run first so the current selection gets a fresh token.";
  }

  return normalized || trimmed;
}
