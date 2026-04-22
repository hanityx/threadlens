import { apiPost, apiPostJsonAllowError } from "@/api";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const THREADS_BOOTSTRAP_CACHE_KEY = "po-threads-cache-v1";
export const LEGACY_THREADS_BOOTSTRAP_CACHE_KEY = "cmc-threads-cache-v1";
export const THREADS_FAST_BOOT_LIMIT = 80;
export const SLOW_PROVIDER_SCAN_MS_DEFAULT = 1200;
export const SLOW_PROVIDER_SCAN_MS_MIN = 800;
export const SLOW_PROVIDER_SCAN_MS_MAX = 6000;
export const SLOW_PROVIDER_SCAN_MS_STORAGE_KEY = "po-slow-provider-threshold-ms";
export const LEGACY_SLOW_PROVIDER_SCAN_MS_STORAGE_KEY = "cmc-slow-provider-threshold-ms";
export const THEME_STORAGE_KEY = "po-theme";
export const LEGACY_THEME_STORAGE_KEY = "cmc-theme";
export const LOCALE_STORAGE_KEY = "po-locale";
export const LEGACY_LOCALE_STORAGE_KEY = "cmc-locale";
export const DENSITY_STORAGE_KEY = "po-density";
export const LEGACY_DENSITY_STORAGE_KEY = "cmc-density";
export const LAYOUT_VIEW_STORAGE_KEY = "po-layout-view";
export const LEGACY_LAYOUT_VIEW_STORAGE_KEY = "cmc-layout-view";
export const PROVIDER_VIEW_STORAGE_KEY = "po-provider-view";
export const LEGACY_PROVIDER_VIEW_STORAGE_KEY = "cmc-provider-view";
export const SETUP_PREFERRED_PROVIDER_STORAGE_KEY = "po-setup-preferred-provider";
export const SETUP_SELECTION_STORAGE_KEY = "po-setup-wizard-selection";
export const SETUP_COMMITTED_STORAGE_KEY = "po-setup-committed";
export const PROVIDER_DEPTH_STORAGE_KEY = "po-provider-depth";
export const LEGACY_PROVIDER_DEPTH_STORAGE_KEY = "cmc-provider-depth";
export const SEARCH_DRAFT_STORAGE_KEY = "po-search-draft";
export const SEARCH_PROVIDER_STORAGE_KEY = "po-search-provider";
export const BACKUP_ROOT_STORAGE_KEY = "po-backup-root";
export const LEGACY_BACKUP_ROOT_STORAGE_KEY = "cmc-backup-root";
export const EXPORT_ROOT_STORAGE_KEY = "po-export-root";
export const LEGACY_EXPORT_ROOT_STORAGE_KEY = "cmc-export-root";
export const PROVIDER_DELETE_BACKUP_ENABLED_STORAGE_KEY = "po-provider-delete-backup-enabled";
export const LAST_EXPORT_ARCHIVE_PATH_STORAGE_KEY = "po-last-export-archive-path";
export const LEGACY_LAST_EXPORT_ARCHIVE_PATH_STORAGE_KEY = "cmc-last-export-archive-path";
export const UPDATE_BANNER_DISMISS_STORAGE_KEY = "po-update-banner-dismissed-version";
export const LEGACY_UPDATE_BANNER_DISMISS_STORAGE_KEY = "cmc-update-banner-dismissed-version";
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

export type SetupCommittedState = {
  selectedProviderIds: string[];
  preferredProviderId: string;
  providerView: string;
  searchProvider: string;
};

function normalizeSetupSelectionIds(items: unknown): string[] {
  return Array.isArray(items)
    ? Array.from(
        new Set(
          items
            .map((item) => String(item || "").trim())
            .filter(Boolean),
        ),
      )
    : [];
}

function alignSetupSelectionWithPreferred(
  selectedProviderIds: string[],
  preferredProviderId: string,
): string[] {
  if (!preferredProviderId || preferredProviderId === "all") return selectedProviderIds;
  if (!selectedProviderIds.includes(preferredProviderId)) {
    return [preferredProviderId, ...selectedProviderIds];
  }
  return [
    preferredProviderId,
    ...selectedProviderIds.filter((providerId) => providerId !== preferredProviderId),
  ];
}

/* ------------------------------------------------------------------ */
/*  Pure helpers                                                       */
/* ------------------------------------------------------------------ */

export function providerActionSelectionKey(
  provider: string,
  action: "backup_local" | "archive_local" | "unarchive_local" | "delete_local",
  filePaths: string[],
  options?: { backup_before_delete?: boolean; backup_root?: string },
): string {
  const normalized = Array.from(
    new Set(filePaths.map((item) => String(item || "").trim()).filter(Boolean)),
  ).sort();
  const backupBeforeDelete = options?.backup_before_delete ? "backup-first" : "direct";
  const backupRoot = String(options?.backup_root || "").trim() || "-";
  return `${provider}|${action}|${backupBeforeDelete}|${backupRoot}|${normalized.join("||")}`;
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

export function writeStorageValue(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage persistence failures
  }
}

export function readCommittedSetupState(): SetupCommittedState | null {
  const raw = readStorageValue([SETUP_COMMITTED_STORAGE_KEY]);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SetupCommittedState> | null;
    if (!parsed || typeof parsed !== "object") return null;
    const preferredProviderId = String(parsed.preferredProviderId || "").trim() || "all";
    const selectedProviderIds = alignSetupSelectionWithPreferred(
      normalizeSetupSelectionIds(parsed.selectedProviderIds),
      preferredProviderId,
    );
    return {
      selectedProviderIds,
      preferredProviderId,
      providerView: String(parsed.providerView || "").trim() || "all",
      searchProvider: String(parsed.searchProvider || "").trim() || "all",
    };
  } catch {
    return null;
  }
}

export function writeCommittedSetupState(state: SetupCommittedState): void {
  const preferredProviderId = String(state.preferredProviderId || "").trim() || "all";
  const payload: SetupCommittedState = {
    selectedProviderIds: alignSetupSelectionWithPreferred(
      normalizeSetupSelectionIds(state.selectedProviderIds),
      preferredProviderId,
    ),
    preferredProviderId,
    providerView: String(state.providerView || "").trim() || "all",
    searchProvider: String(state.searchProvider || "").trim() || "all",
  };
  writeStorageValue(SETUP_COMMITTED_STORAGE_KEY, JSON.stringify(payload));
}

export function readPersistedSetupState(): SetupCommittedState | null {
  const committed = readCommittedSetupState();
  if (committed) return committed;

  const preferredProviderId =
    String(readStorageValue([SETUP_PREFERRED_PROVIDER_STORAGE_KEY]) || "").trim() || "all";
  const providerView =
    String(
      readStorageValue([PROVIDER_VIEW_STORAGE_KEY, LEGACY_PROVIDER_VIEW_STORAGE_KEY]) || "",
    ).trim() || (preferredProviderId !== "all" ? preferredProviderId : "all");
  const searchProvider =
    String(readStorageValue([SEARCH_PROVIDER_STORAGE_KEY]) || "").trim() ||
    (preferredProviderId !== "all" ? preferredProviderId : "all");

  if (preferredProviderId === "all") {
    return {
      selectedProviderIds: [],
      preferredProviderId: "all",
      providerView: "all",
      searchProvider: "all",
    };
  }

  const rawSelection = readStorageValue([SETUP_SELECTION_STORAGE_KEY]);
  let selectedProviderIds: string[] = [];
  if (rawSelection) {
    try {
      selectedProviderIds = normalizeSetupSelectionIds(JSON.parse(rawSelection));
    } catch {
      selectedProviderIds = [];
    }
  }
  if (!selectedProviderIds.includes(preferredProviderId)) {
    selectedProviderIds = [preferredProviderId, ...selectedProviderIds];
  }

  return {
    selectedProviderIds,
    preferredProviderId,
    providerView,
    searchProvider,
  };
}

export function readPersistedSearchProviderPreference(): string {
  const dedicated =
    String(readStorageValue([SEARCH_PROVIDER_STORAGE_KEY]) || "").trim();
  if (dedicated) return dedicated;
  return String(readPersistedSetupState()?.searchProvider || "").trim() || "all";
}

export function readDismissedUpdateVersion(): string {
  return (
    readStorageValue([
      UPDATE_BANNER_DISMISS_STORAGE_KEY,
      LEGACY_UPDATE_BANNER_DISMISS_STORAGE_KEY,
    ]) ?? ""
  );
}

export function persistDismissedUpdateVersion(version: string): void {
  if (!version) return;
  writeStorageValue(UPDATE_BANNER_DISMISS_STORAGE_KEY, version);
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

  if (normalized.includes("backup_root_outside_home")) {
    return "The backup folder must stay inside your home directory. Choose a folder under your user home and try again.";
  }

  return normalized || trimmed;
}
