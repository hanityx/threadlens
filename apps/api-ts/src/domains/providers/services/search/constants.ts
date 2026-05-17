import type { ProviderId } from "../../types.js";
import {
  listSearchableProviderIds,
} from "../../capabilities.js";

export const PROVIDER_SCAN_CACHE_TTL_MS = 60_000;
export const PROVIDER_MANIFEST_CACHE_TTL_MS = 5 * 60_000;
export const OPENABLE_THREAD_IDS_CACHE_TTL_MS = 15_000;
export const CONVERSATION_SEARCH_RESPONSE_CACHE_TTL_MS = 15_000;
export const DEFAULT_CONVERSATION_SEARCH_PROVIDERS: ProviderId[] = [
  ...listSearchableProviderIds(),
];
export const DEFAULT_CONVERSATION_SEARCH_LIMIT = 40;
export const MAX_CONVERSATION_SEARCH_LIMIT = 200;
export const DEFAULT_CONVERSATION_SEARCH_TRANSCRIPT_LIMIT = 10_000;
export const MAX_CONVERSATION_SEARCH_SCAN_LIMIT = 1_200;
export const SEARCH_TRANSCRIPT_CONCURRENCY = 4;
export const CONVERSATION_SEARCH_SCAN_CONCURRENCY = 8;
export const SEARCH_TRANSCRIPT_CACHE_MAX_ENTRIES = 2_000;
export const DEFAULT_CONVERSATION_SEARCH_SCAN_MULTIPLIER = 4;
export const DEFAULT_CONVERSATION_SEARCH_SCAN_FLOOR = 160;
export const PROVIDER_SCAN_FILE_STAT_CONCURRENCY = 32;
export const PROVIDER_SESSION_MANIFEST_FILE_LIMIT = 8_000;
export const PROVIDER_SCAN_BUDGET_WEIGHTS: Partial<Record<ProviderId, number>> = {
  codex: 1.35,
  claude: 1.35,
  gemini: 1,
  copilot: 0.85,
};
export const EMPTY_PROVIDER_SESSION_PROBE = {
  ok: true,
  format: "unknown" as const,
  error: null,
  detected_title: "",
  title_source: null,
};
