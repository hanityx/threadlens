export const normalizeDesktopRouteFilePath = (filePath: string): string => {
  const trimmed = String(filePath || "").trim();
  if (!trimmed) return "";
  if (trimmed.includes("/.codex/sessions/")) {
    return trimmed.replace("/.codex/sessions/", "/.codex-cli/sessions/");
  }
  return trimmed;
};
