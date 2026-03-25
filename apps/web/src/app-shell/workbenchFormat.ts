const railDayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const HOME_PATH_MARKER = `/${"Users"}/`;
const WORKTREE_MARKER = "worktree-cache/";

const railTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

export const providerFromSourceKey = (sourceKey: string): string | null => {
  const key = sourceKey.toLowerCase();
  if (key.startsWith("claude")) return "claude";
  if (key.startsWith("gemini")) return "gemini";
  if (key.startsWith("copilot")) return "copilot";
  if (key.startsWith("chat_")) return "chatgpt";
  if (
    key.startsWith("codex_") ||
    key === "sessions" ||
    key === "archived_sessions" ||
    key === "history" ||
    key === "global_state"
  ) {
    return "codex";
  }
  return null;
};

export const compactWorkbenchId = (value?: string | null, prefix = "item"): string => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return prefix;
  const normalized = trimmed.toLowerCase().startsWith(`${prefix.toLowerCase()}-`)
    ? trimmed.slice(prefix.length + 1)
    : trimmed;
  const useTail = /^\d{4}-\d{2}-/.test(normalized);
  if (normalized.length <= 18) return `${prefix} ${normalized}`;
  return `${prefix} ${useTail ? normalized.slice(-8) : normalized.slice(0, 8)}`;
};

export const normalizeWorkbenchTitle = (value?: string | null, fallback?: string | null): string => {
  const trimmed = String(value || "").trim();
  const fallbackText = String(fallback || "").trim();
  if (!trimmed || trimmed.toLowerCase() === "none") {
    return fallbackText;
  }
  const uuidLike =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
  if (uuidLike && fallbackText) {
    return fallbackText;
  }
  const sanitized = trimmed.replace(
    /`?(?:\/Users\/[^\s`]+|~\/[^\s`]+|Labs\/[^\s`]+)`?/g,
    (rawPath) => {
      const cleaned = rawPath.replace(/[`]/g, "").replace(/\/$/, "");
      const parts = cleaned.split("/").filter(Boolean);
      const tail = parts.slice(-2).join("/");
      if (!tail || cleaned.includes(WORKTREE_MARKER) || cleaned.includes(HOME_PATH_MARKER)) {
        return "local workspace";
      }
      return tail;
    },
  );
  return sanitized
    .replace(/\b(?:provider-surface|workspace-surface|quartz-\d{8}|history-clean-\d{8})[^\s`]*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
};

export const normalizeWorkbenchSessionTitle = (
  value?: string | null,
  fallback?: string | null,
): string => {
  const normalized = normalizeWorkbenchTitle(value, fallback);
  const fallbackText = String(fallback || "").trim();
  const lower = normalized.toLowerCase();
  const looksGenerated =
    lower.startsWith("rollout-") ||
    normalized.includes("AGENTS.md") ||
    normalized.includes("<INSTRUCTIONS>") ||
    normalized.includes(HOME_PATH_MARKER) ||
    normalized.length > 72;
  return looksGenerated && fallbackText ? fallbackText : normalized;
};

export const formatWorkbenchRailDay = (value?: string | null): string => {
  if (!value) return "Recent";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return railDayFormatter.format(date);
};

export const formatWorkbenchRailTime = (value?: string | null): string => {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return railTimeFormatter.format(date);
};

export const formatWorkbenchGroupLabel = (value?: string | null): string => {
  if (!value) return "Recent";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return railDayFormatter.format(date).toUpperCase();
};
