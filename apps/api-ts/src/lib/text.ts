export function cleanTitleText(text: string, maxLen = 280): string {
  const t = String(text || "")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1).trim()}…`;
}
