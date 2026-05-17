import type {
  ConversationSearchPayload,
  ProviderId,
  ProviderSessionRow,
  ProviderSessionScan,
  TranscriptPayload,
} from "../../types.js";

export type ProviderScanCacheEntry = {
  expires_at: number;
  scan: ProviderSessionScan;
};

export type ProviderSessionCandidate = {
  source: string;
  file_path: string;
  size_bytes: number;
  mtime: string;
  mtime_ms: number;
};

export type ProviderSessionManifest = {
  provider: ProviderId;
  name: string;
  root_exists: boolean;
  candidates: ProviderSessionCandidate[];
  total_bytes: number;
};

export type ProviderManifestCacheEntry = {
  expires_at: number;
  manifest: ProviderSessionManifest;
};

export type PersistedProviderManifestCacheEntry = {
  expires_at: number;
  manifest: ProviderSessionManifest;
};

export type ConversationSearchResponseCacheEntry = {
  expires_at: number;
  payload: ConversationSearchPayload;
};

export type ConversationTranscriptLoader = (
  provider: ProviderId,
  filePath: string,
) => Promise<TranscriptPayload>;

export type CachedConversationTranscriptLoader = (
  row: ProviderSessionRow,
) => Promise<TranscriptPayload | null>;

export type TranscriptSearchCacheEntry = {
  mtime: string;
  transcript: TranscriptPayload | null;
};
