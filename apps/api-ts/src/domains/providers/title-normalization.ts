export function normalizeDetectedTitle(text: string, maxLen = 96): string {
  const singleLine = String(text || "").replace(/\s+/g, " ").trim();
  if (!singleLine) return "";
  return singleLine.length > maxLen
    ? `${singleLine.slice(0, maxLen - 1).trimEnd()}…`
    : singleLine;
}
