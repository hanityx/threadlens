import path from "node:path";

import {
  providerName,
  providerScanRootSpecs,
} from "../../path-safety.js";
import {
  inferSessionId,
} from "../../probe.js";
import type {
  ProviderId,
} from "../../types.js";
import {
  throwIfAborted,
} from "./abort.js";
import {
  collectProviderSessionCandidates,
  providerSessionRootExists,
  providerSessionSourcePriority,
} from "./session-manifest-files.js";
import type {
  ProviderSessionCandidate,
  ProviderSessionManifest,
} from "./types.js";

export {
  providerSessionSourcePriority,
} from "./session-manifest-files.js";
export {
  materializeProviderSessionMetadataScan,
  materializeProviderSessionRow,
  materializeProviderSessionScan,
} from "./session-manifest-rows.js";

export async function buildProviderSessionManifest(
  provider: ProviderId,
  options?: { signal?: AbortSignal },
): Promise<ProviderSessionManifest> {
  throwIfAborted(options?.signal);
  const roots = await providerScanRootSpecs(provider);
  throwIfAborted(options?.signal);
  const rootExists = await providerSessionRootExists(provider, roots);
  const candidates = await collectProviderSessionCandidates(provider, roots, {
    signal: options?.signal,
  });
  return {
    provider,
    name: providerName(provider),
    root_exists: rootExists,
    candidates,
    total_bytes: candidates.reduce(
      (sum, candidate) => sum + Number(candidate.size_bytes || 0),
      0,
    ),
  };
}

function dedupeProviderSessionCandidates(
  provider: ProviderId,
  candidates: ProviderSessionCandidate[],
): ProviderSessionCandidate[] {
  const uniqueCandidates = new Map<string, ProviderSessionCandidate>();
  for (const candidate of candidates) {
    const key = `${provider}:${inferSessionId(candidate.file_path) || path.resolve(candidate.file_path)}`;
    const existing = uniqueCandidates.get(key);
    if (!existing) {
      uniqueCandidates.set(key, candidate);
      continue;
    }
    const existingPriority = providerSessionSourcePriority(existing.source);
    const nextPriority = providerSessionSourcePriority(candidate.source);
    if (
      nextPriority > existingPriority ||
      (nextPriority === existingPriority && candidate.mtime_ms > existing.mtime_ms)
    ) {
      uniqueCandidates.set(key, candidate);
    }
  }
  return [...uniqueCandidates.values()];
}

export function selectProviderSessionManifestCandidate(
  manifest: ProviderSessionManifest,
  options: { sessionId: string; filePath?: string },
): ProviderSessionCandidate | null {
  const normalizedFilePath = options.filePath ? path.resolve(options.filePath) : "";
  const dedupedCandidates = dedupeProviderSessionCandidates(
    manifest.provider,
    manifest.candidates,
  );
  const matchesRequestedSession = (candidate: ProviderSessionCandidate) =>
    inferSessionId(candidate.file_path) === options.sessionId;
  const filePathMatch = normalizedFilePath
    ? dedupedCandidates.find(
        (candidate) => path.resolve(candidate.file_path) === normalizedFilePath,
      )
    : null;
  if (filePathMatch && matchesRequestedSession(filePathMatch)) {
    return filePathMatch;
  }
  return dedupedCandidates.find(matchesRequestedSession) ?? null;
}
