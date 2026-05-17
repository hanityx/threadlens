import {
  fallbackDisplayTitle,
} from "../../search-helpers.js";
import {
  extractCodexThreadIdFromSessionName,
  getCodexThreadTitleMap,
} from "../../title-detection.js";
import {
  inferSessionId,
  probeSessionFile,
} from "../../probe.js";
import {
  providerStatus,
} from "../../matrix.js";
import type {
  ProviderSessionRow,
  ProviderSessionScan,
} from "../../types.js";
import {
  throwIfAborted,
} from "./abort.js";
import {
  EMPTY_PROVIDER_SESSION_PROBE,
  MAX_CONVERSATION_SEARCH_SCAN_LIMIT,
} from "./constants.js";
import type {
  ProviderSessionCandidate,
  ProviderSessionManifest,
} from "./types.js";

async function materializeProviderSessionRowWithTitles(
  manifest: ProviderSessionManifest,
  candidate: ProviderSessionCandidate,
  codexTitleMap?: Map<string, string> | null,
  options?: { signal?: AbortSignal },
): Promise<ProviderSessionRow> {
  throwIfAborted(options?.signal);
  const rawSessionId = inferSessionId(candidate.file_path);
  const codexThreadId =
    manifest.provider === "codex"
      ? extractCodexThreadIdFromSessionName(rawSessionId)
      : "";
  const sessionId = codexThreadId || rawSessionId;
  const probe = await probeSessionFile(candidate.file_path);
  throwIfAborted(options?.signal);
  return {
    provider: manifest.provider,
    source: candidate.source,
    session_id: sessionId,
    display_title:
      (codexTitleMap && codexThreadId ? codexTitleMap.get(codexThreadId) : "") ||
      probe.detected_title ||
      fallbackDisplayTitle(manifest.provider, sessionId, candidate.source),
    file_path: candidate.file_path,
    size_bytes: candidate.size_bytes,
    mtime: candidate.mtime,
    probe,
  };
}

export async function materializeProviderSessionRow(
  manifest: ProviderSessionManifest,
  candidate: ProviderSessionCandidate,
  options?: { signal?: AbortSignal },
): Promise<ProviderSessionRow> {
  const codexTitleMap =
    manifest.provider === "codex" ? await getCodexThreadTitleMap() : null;
  return materializeProviderSessionRowWithTitles(
    manifest,
    candidate,
    codexTitleMap,
    options,
  );
}

export async function materializeProviderSessionScan(
  manifest: ProviderSessionManifest,
  limit = 80,
  options?: { maxLimit?: number; signal?: AbortSignal },
): Promise<ProviderSessionScan> {
  throwIfAborted(options?.signal);
  const startedAt = Date.now();
  const hardLimit = Math.max(
    1,
    Number(options?.maxLimit) || MAX_CONVERSATION_SEARCH_SCAN_LIMIT,
  );
  const safeLimit = Math.max(1, Math.min(hardLimit, Number(limit) || 80));
  const selected = manifest.candidates.slice(0, safeLimit);
  const codexTitleMap =
    manifest.provider === "codex" ? await getCodexThreadTitleMap() : null;
  throwIfAborted(options?.signal);
  const rows: ProviderSessionRow[] = await Promise.all(
    selected.map((candidate) =>
      materializeProviderSessionRowWithTitles(manifest, candidate, codexTitleMap, {
        signal: options?.signal,
      }),
    ),
  );

  return {
    provider: manifest.provider,
    name: manifest.name,
    status: providerStatus(manifest.root_exists, manifest.candidates.length),
    rows,
    scanned: rows.length,
    truncated: manifest.candidates.length > safeLimit,
    scan_ms: Math.max(0, Date.now() - startedAt),
    total_bytes: manifest.total_bytes,
  };
}

export function materializeProviderSessionMetadataScan(
  manifest: ProviderSessionManifest,
  limit = 80,
  options?: { maxLimit?: number },
): ProviderSessionScan {
  const startedAt = Date.now();
  const hardLimit = Math.max(
    1,
    Number(options?.maxLimit) || MAX_CONVERSATION_SEARCH_SCAN_LIMIT,
  );
  const safeLimit = Math.max(1, Math.min(hardLimit, Number(limit) || 80));
  const rows: ProviderSessionRow[] = manifest.candidates.slice(0, safeLimit).map((candidate) => ({
    provider: manifest.provider,
    source: candidate.source,
    session_id: inferSessionId(candidate.file_path),
    display_title: "",
    file_path: candidate.file_path,
    size_bytes: candidate.size_bytes,
    mtime: candidate.mtime,
    probe: EMPTY_PROVIDER_SESSION_PROBE,
  }));

  return {
    provider: manifest.provider,
    name: manifest.name,
    status: providerStatus(manifest.root_exists, manifest.candidates.length),
    rows,
    scanned: rows.length,
    truncated: manifest.candidates.length > safeLimit,
    scan_ms: Math.max(0, Date.now() - startedAt),
    total_bytes: manifest.total_bytes,
  };
}
