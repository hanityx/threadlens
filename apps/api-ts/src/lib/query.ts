export type QueryMap = Record<string, string | string[] | undefined>;

export function parseNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function parseQueryString(
  value: string | string[] | undefined,
): string {
  if (Array.isArray(value)) return String(value[0] ?? "");
  return String(value ?? "");
}

export function parseQueryNumber(
  value: string | string[] | undefined,
  fallback: number,
): number {
  const n = Number(parseQueryString(value));
  return Number.isFinite(n) ? n : fallback;
}

export function canonicalizeQuery(query?: QueryMap): string {
  if (!query) return "";
  const keys = Object.keys(query).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const value = query[key];
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      [...value].sort().forEach((item) => {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(item)}`);
      });
      continue;
    }
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return parts.join("&");
}
