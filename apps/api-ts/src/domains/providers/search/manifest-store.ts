import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ProviderId } from "../types.js";
import { providerScanRootSpecs } from "../path-safety.js";
import type {
  PersistedProviderManifestCacheEntry,
  ProviderSessionCandidate,
} from "./types.js";

export function resolveSearchCacheDirectory(): string {
  const override = String(process.env.THREADLENS_SEARCH_CACHE_DIR || "").trim();
  return override || path.join(os.tmpdir(), "threadlens-search-cache");
}

export function providerManifestCacheFilePath(provider: ProviderId): string {
  const version = createHash("sha1").update(provider).digest("hex").slice(0, 8);
  return path.join(resolveSearchCacheDirectory(), `manifest-${provider}-${version}.json`);
}

export async function readPersistedProviderManifest(
  provider: ProviderId,
): Promise<PersistedProviderManifestCacheEntry | null> {
  try {
    const raw = await readFile(providerManifestCacheFilePath(provider), "utf8");
    const parsed = JSON.parse(raw) as PersistedProviderManifestCacheEntry;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.manifest || !Array.isArray(parsed.manifest.candidates)) return null;
    if (parsed.manifest.provider !== provider) return null;
    const candidates = await validatePersistedProviderCandidates(
      provider,
      parsed.manifest.candidates,
    );
    if (parsed.manifest.candidates.length > 0 && candidates.length === 0) {
      return null;
    }
    return {
      ...parsed,
      manifest: {
        ...parsed.manifest,
        candidates,
        total_bytes: candidates.reduce(
          (sum, candidate) => sum + Number(candidate.size_bytes || 0),
          0,
        ),
      },
    };
  } catch {
    return null;
  }
}

async function validatePersistedProviderCandidates(
  provider: ProviderId,
  candidates: ProviderSessionCandidate[],
): Promise<ProviderSessionCandidate[]> {
  const specs = await providerScanRootSpecs(provider);
  const rootRealPaths = await Promise.all(
    specs.map(async (spec) => {
      try {
        return {
          ...spec,
          realRoot: await realpath(spec.root),
        };
      } catch {
        return null;
      }
    }),
  );
  const usableRoots = rootRealPaths.filter(
    (entry): entry is NonNullable<(typeof rootRealPaths)[number]> => Boolean(entry),
  );
  if (!usableRoots.length) return [];

  const safeCandidates: ProviderSessionCandidate[] = [];
  for (const candidate of candidates) {
    const ext = path.extname(candidate.file_path).toLowerCase();
    let realCandidate = "";
    try {
      realCandidate = await realpath(candidate.file_path);
    } catch {
      continue;
    }
    const matchingRoot = usableRoots.find(
      (spec) =>
        spec.exts.includes(ext) &&
        (realCandidate === spec.realRoot ||
          realCandidate.startsWith(`${spec.realRoot}${path.sep}`)),
    );
    if (!matchingRoot) continue;
    safeCandidates.push({
      ...candidate,
      file_path: realCandidate,
      source: matchingRoot.source,
    });
  }
  return safeCandidates;
}

export async function writePersistedProviderManifest(
  provider: ProviderId,
  entry: PersistedProviderManifestCacheEntry,
): Promise<void> {
  const filePath = providerManifestCacheFilePath(provider);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(entry), "utf8");
}

export async function deletePersistedProviderManifest(provider: ProviderId): Promise<void> {
  await rm(providerManifestCacheFilePath(provider), { force: true });
}
