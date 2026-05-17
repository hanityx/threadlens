import type {
  ProviderId,
  ProviderSessionScan,
} from "../../types.js";
import {
  invalidateCodexThreadTitleMapCache,
} from "../../title-detection.js";
import {
  awaitAbortable,
  throwIfAborted,
} from "./abort.js";
import {
  bumpProviderSearchGeneration,
  conversationSearchResponseCache,
  getProviderSearchGeneration,
  invalidatedProviderManifests,
  providerManifestCache,
  providerManifestInflight,
  providerScanCache,
  providerScanCacheKey,
  providerScanInflight,
} from "./cache.js";
import {
  DEFAULT_CONVERSATION_SEARCH_PROVIDERS,
  MAX_CONVERSATION_SEARCH_SCAN_LIMIT,
  PROVIDER_MANIFEST_CACHE_TTL_MS,
  PROVIDER_SCAN_CACHE_TTL_MS,
} from "./constants.js";
import {
  deletePersistedProviderManifest,
  readPersistedProviderManifest,
  writePersistedProviderManifest,
} from "./manifest-store.js";
import { resolveOpenableThreadIds } from "./openable-threads.js";
import {
  buildProviderSessionManifest,
  materializeProviderSessionScan,
} from "./session-manifest.js";
import type { ProviderSessionManifest } from "./types.js";

export function invalidateProviderSearchCaches(provider: ProviderId) {
  bumpProviderSearchGeneration(provider);
  for (const key of providerScanCache.keys()) {
    if (key.startsWith(`${provider}:`)) {
      providerScanCache.delete(key);
    }
  }
  for (const key of providerScanInflight.keys()) {
    if (key.startsWith(`${provider}:`)) {
      providerScanInflight.delete(key);
    }
  }
  providerManifestCache.delete(provider);
  providerManifestInflight.delete(provider);
  invalidatedProviderManifests.add(provider);
  conversationSearchResponseCache.clear();
  void deletePersistedProviderManifest(provider);
}

export async function getProviderSessionScan(
  provider: ProviderId,
  limit = 80,
  options?: { forceRefresh?: boolean; signal?: AbortSignal },
): Promise<ProviderSessionScan> {
  const safeLimit = Math.max(
    1,
    Math.min(MAX_CONVERSATION_SEARCH_SCAN_LIMIT, Number(limit) || 80),
  );
  const key = providerScanCacheKey(provider, safeLimit);
  const forceRefresh = Boolean(options?.forceRefresh);
  const now = Date.now();

  if (!forceRefresh) {
    const cached = providerScanCache.get(key);
    if (cached && cached.expires_at > now) return cached.scan;
  } else {
    invalidateProviderSearchCaches(provider);
    if (provider === "codex") {
      invalidateCodexThreadTitleMapCache();
    }
  }
  const generation = getProviderSearchGeneration(provider);

  const inflight = providerScanInflight.get(key);
  if (inflight) return awaitAbortable(inflight, options?.signal);

  const task = getProviderSessionManifest(provider, forceRefresh)
    .then((manifest) =>
      materializeProviderSessionScan(manifest, safeLimit),
    )
    .then((scan) => {
      if (getProviderSearchGeneration(provider) === generation) {
        providerScanCache.set(key, {
          expires_at: Date.now() + PROVIDER_SCAN_CACHE_TTL_MS,
          scan,
        });
      }
      return scan;
    })
    .finally(() => {
      if (providerScanInflight.get(key) === task) {
        providerScanInflight.delete(key);
      }
    });

  providerScanInflight.set(key, task);
  return awaitAbortable(task, options?.signal);
}

export async function getProviderSessionManifest(
  provider: ProviderId,
  forceRefresh = false,
  signal?: AbortSignal,
): Promise<ProviderSessionManifest> {
  const now = Date.now();
  const skipPersistedManifest = forceRefresh || invalidatedProviderManifests.has(provider);
  const generation = getProviderSearchGeneration(provider);
  throwIfAborted(signal);
  if (!skipPersistedManifest) {
    const cached = providerManifestCache.get(provider);
    if (cached && cached.expires_at > now) return cached.manifest;
    const persisted = await readPersistedProviderManifest(provider);
    if (persisted && persisted.expires_at > now) {
      providerManifestCache.set(provider, persisted);
      return persisted.manifest;
    }
  }

  const inflight = providerManifestInflight.get(provider);
  if (inflight) return awaitAbortable(inflight, signal);

  const task = buildProviderSessionManifest(provider)
    .then((manifest) => {
      if (getProviderSearchGeneration(provider) !== generation) {
        return manifest;
      }
      const entry = {
        expires_at: Date.now() + PROVIDER_MANIFEST_CACHE_TTL_MS,
        manifest,
      };
      providerManifestCache.set(provider, entry);
      invalidatedProviderManifests.delete(provider);
      return writePersistedProviderManifest(provider, entry)
        .catch(() => undefined)
        .then(() => manifest);
    })
    .finally(() => {
      if (providerManifestInflight.get(provider) === task) {
        providerManifestInflight.delete(provider);
      }
    });

  providerManifestInflight.set(provider, task);
  return awaitAbortable(task, signal);
}

export async function primeConversationSearchCaches(
  providers: ProviderId[] = defaultConversationSearchProviders(),
): Promise<void> {
  const targets = Array.from(new Set(providers));
  await Promise.allSettled([
    ...targets.map((provider) =>
      getProviderSessionManifest(provider, false),
    ),
    resolveOpenableThreadIds(false),
  ]);
}

export function defaultConversationSearchProviders(): ProviderId[] {
  return [...DEFAULT_CONVERSATION_SEARCH_PROVIDERS];
}
