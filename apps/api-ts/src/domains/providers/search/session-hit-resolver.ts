import path from "node:path";

import {
  inferSessionId,
} from "../probe.js";
import type {
  ConversationSearchSessionHitsPayload,
  ProviderId,
  ProviderSessionRow,
} from "../types.js";
import {
  materializeProviderSessionRow,
  selectProviderSessionManifestCandidate,
} from "./session-manifest.js";
import {
  resolveOpenableThreadIds,
} from "./openable-threads.js";
import {
  getProviderSessionManifest,
} from "./provider-session-scan.js";
import {
  dedupeConversationSearchRows,
} from "./session-results.js";
import {
  searchConversationSessionHits,
} from "./session-search.js";

export async function searchConversationSessionHitsTs(
  q: string,
  options: {
    provider: ProviderId;
    sessionId: string;
    filePath?: string;
    pageSize?: number;
    cursor?: string;
    forceRefresh?: boolean;
    transcriptLimit?: number;
    signal?: AbortSignal;
  },
): Promise<ConversationSearchSessionHitsPayload | null> {
  const forceRefresh = Boolean(options.forceRefresh);
  const manifest = await getProviderSessionManifest(
    options.provider,
    forceRefresh,
    options.signal,
  );
  const candidate = selectProviderSessionManifestCandidate(manifest, {
    sessionId: options.sessionId,
    filePath: options.filePath,
  });
  if (!candidate) return null;
  const targetRow = await materializeProviderSessionRow(
    manifest,
    candidate,
    { signal: options.signal },
  );
  if (!targetRow) return null;
  if (!targetRow.probe.ok) return null;
  const openableThreadIds = await resolveOpenableThreadIds(forceRefresh);
  return searchConversationSessionHits(targetRow, q, {
    pageSize: options.pageSize,
    cursor: options.cursor,
    transcriptLimit: options.transcriptLimit,
    openableThreadIds,
    signal: options.signal,
  });
}

export function selectConversationSessionHitsRow(
  rows: ProviderSessionRow[],
  options: { sessionId: string; filePath?: string },
): ProviderSessionRow | null {
  const normalizedFilePath = options.filePath ? path.resolve(options.filePath) : "";
  const dedupedRows = dedupeConversationSearchRows(rows);
  const matchesRequestedSession = (row: ProviderSessionRow) =>
    row.session_id === options.sessionId || inferSessionId(row.file_path) === options.sessionId;
  const filePathMatch = normalizedFilePath
    ? dedupedRows.find((row) => path.resolve(row.file_path) === normalizedFilePath)
    : null;
  if (filePathMatch && matchesRequestedSession(filePathMatch)) {
    return filePathMatch;
  }
  return dedupedRows.find(matchesRequestedSession) ?? null;
}
