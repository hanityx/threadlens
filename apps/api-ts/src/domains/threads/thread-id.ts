import path from "node:path";

const THREAD_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function parseSafeThreadId(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!THREAD_ID_RE.test(value)) return null;
  if (value.includes("..") || /[\\/]/.test(value)) return null;
  return value;
}

export function normalizeSafeThreadIds(rawIds: unknown[]): {
  ids: string[];
  invalid: string[];
} {
  const ids: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawIds) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    const safe = parseSafeThreadId(value);
    if (!safe) {
      invalid.push(value);
      continue;
    }
    if (seen.has(safe)) continue;
    seen.add(safe);
    ids.push(safe);
  }
  return { ids, invalid };
}

export function resolveThreadCacheFile(root: string, threadId: string): string | null {
  const safeId = parseSafeThreadId(threadId);
  if (!safeId) return null;
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, `${safeId}.data`);
  return candidate.startsWith(`${resolvedRoot}${path.sep}`) ? candidate : null;
}
