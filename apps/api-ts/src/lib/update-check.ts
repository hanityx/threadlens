import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { UpdateCheckStatus } from "@threadlens/shared-contracts";
import {
  APP_VERSION,
  THREADLENS_GITHUB_RELEASE_API_URL,
  THREADLENS_LATEST_RELEASE_URL,
  UPDATE_CHECK_CACHE_FILE,
} from "./constants.js";

const UPDATE_CHECK_TTL_MS = 24 * 60 * 60 * 1000;
const UPDATE_CHECK_FAILURE_TTL_MS = 15 * 60 * 1000;
const UPDATE_CHECK_TIMEOUT_MS = 5_000;

let cachedResult: UpdateCheckStatus | null = null;
let cachedUntil = 0;

function normalizeVersion(version: string): string {
  return String(version || "")
    .trim()
    .replace(/^v/i, "")
    .split("-")[0]
    .trim();
}

function normalizeReleaseText(value: string): string {
  return value.replace(/\[(.*?)\]\((.*?)\)/g, "$1").replace(/\s+/g, " ").trim();
}

function extractReleaseSummary(body: string): string | null {
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    if (/^[-*_]{3,}$/.test(line)) continue;
    if (line.startsWith("![")) continue;
    const normalized = normalizeReleaseText(line.replace(/^[-*]\s+/, ""));
    if (normalized) {
      return normalized.slice(0, 180);
    }
  }
  return null;
}

export function compareReleaseVersions(left: string, right: string): number {
  const leftParts = normalizeVersion(left).split(".").map((part) => Number(part || 0));
  const rightParts = normalizeVersion(right).split(".").map((part) => Number(part || 0));
  const width = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < width; index += 1) {
    const leftValue = Number.isFinite(leftParts[index] ?? 0) ? (leftParts[index] ?? 0) : 0;
    const rightValue = Number.isFinite(rightParts[index] ?? 0) ? (rightParts[index] ?? 0) : 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }
  return 0;
}

export function resetUpdateCheckCacheForTests() {
  cachedResult = null;
  cachedUntil = 0;
}

function normalizeCachedUpdateResult(
  cached: UpdateCheckStatus,
  currentVersion: string,
): UpdateCheckStatus {
  const latestVersion = cached.latest_version ? normalizeVersion(cached.latest_version) : null;
  const hasUpdate = latestVersion
    ? compareReleaseVersions(latestVersion, currentVersion) > 0
    : false;
  return {
    ...cached,
    current_version: currentVersion,
    latest_version: latestVersion,
    has_update: hasUpdate,
    status: cached.error
      ? "unavailable"
      : hasUpdate
        ? "available"
        : "up-to-date",
  };
}

function resolveCachedUntil(result: UpdateCheckStatus, ttlMs: number, failureTtlMs: number): number {
  const checkedAtMs = Date.parse(result.checked_at);
  if (!Number.isFinite(checkedAtMs)) return 0;
  return checkedAtMs + (result.status === "unavailable" || result.error ? failureTtlMs : ttlMs);
}

async function readPersistedUpdateCheck(
  cacheFilePath: string,
): Promise<UpdateCheckStatus | null> {
  try {
    const raw = await readFile(cacheFilePath, "utf-8");
    const parsed = JSON.parse(raw) as UpdateCheckStatus;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.checked_at !== "string") return null;
    if (typeof parsed.current_version !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writePersistedUpdateCheck(
  cacheFilePath: string,
  result: UpdateCheckStatus,
): Promise<void> {
  try {
    await mkdir(path.dirname(cacheFilePath), { recursive: true });
    await writeFile(cacheFilePath, JSON.stringify(result, null, 2), "utf-8");
  } catch {
    // Update checks should never fail just because the cache file cannot be written.
  }
}

export async function checkForUpdates(options?: {
  currentVersion?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  cacheFilePath?: string;
  ttlMs?: number;
  failureTtlMs?: number;
  timeoutMs?: number;
}): Promise<UpdateCheckStatus> {
  const now = options?.now ?? Date.now;
  const nowMs = now();
  const fetchImpl = options?.fetchImpl ?? fetch;
  const currentVersion = normalizeVersion(options?.currentVersion ?? APP_VERSION) || APP_VERSION;
  const checkedAt = new Date(nowMs).toISOString();
  const cacheFilePath = options?.cacheFilePath ?? UPDATE_CHECK_CACHE_FILE;
  const ttlMs = options?.ttlMs ?? UPDATE_CHECK_TTL_MS;
  const failureTtlMs = options?.failureTtlMs ?? UPDATE_CHECK_FAILURE_TTL_MS;
  const timeoutMs = options?.timeoutMs ?? UPDATE_CHECK_TIMEOUT_MS;

  if (cachedResult && nowMs < cachedUntil) {
    return normalizeCachedUpdateResult(cachedResult, currentVersion);
  }

  const persisted = await readPersistedUpdateCheck(cacheFilePath);
  const persistedUntil = persisted ? resolveCachedUntil(persisted, ttlMs, failureTtlMs) : 0;
  if (persisted && nowMs < persistedUntil) {
    cachedResult = persisted;
    cachedUntil = persistedUntil;
    return normalizeCachedUpdateResult(persisted, currentVersion);
  }

  try {
    const response = await fetchImpl(THREADLENS_GITHUB_RELEASE_API_URL, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "ThreadLens",
      },
      signal: timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    if (!response.ok) {
      throw new Error(`github-release-status-${response.status}`);
    }

    const payload = (await response.json()) as {
      tag_name?: unknown;
      name?: unknown;
      body?: unknown;
      html_url?: unknown;
    };
    const latestVersion = normalizeVersion(String(payload.tag_name ?? ""));
    if (!latestVersion) {
      throw new Error("github-release-missing-tag");
    }

    const releaseUrl = String(payload.html_url ?? "").trim() || THREADLENS_LATEST_RELEASE_URL;
    const releaseTitle = normalizeReleaseText(String(payload.name ?? "").trim()) || null;
    const releaseSummary = extractReleaseSummary(String(payload.body ?? ""));
    const hasUpdate = compareReleaseVersions(latestVersion, currentVersion) > 0;
    const result: UpdateCheckStatus = {
      source: "github-releases",
      status: hasUpdate ? "available" : "up-to-date",
      checked_at: checkedAt,
      current_version: currentVersion,
      latest_version: latestVersion,
      release_title: releaseTitle,
      release_summary: releaseSummary,
      has_update: hasUpdate,
      release_url: releaseUrl,
      error: null,
    };
    cachedResult = result;
    cachedUntil = nowMs + ttlMs;
    await writePersistedUpdateCheck(cacheFilePath, result);
    return result;
  } catch (error) {
    const result: UpdateCheckStatus = {
      source: "github-releases",
      status: "unavailable",
      checked_at: checkedAt,
      current_version: currentVersion,
      latest_version: null,
      release_title: null,
      release_summary: null,
      has_update: false,
      release_url: THREADLENS_LATEST_RELEASE_URL,
      error: error instanceof Error ? error.message : String(error),
    };
    cachedResult = result;
    cachedUntil = nowMs + failureTtlMs;
    await writePersistedUpdateCheck(cacheFilePath, result);
    return result;
  }
}
