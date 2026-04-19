const railDayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const HOME_PATH_MARKER = /\/(?:Users|home)\//;
const HIDDEN_WORKTREE_DIR = `.${["work", "trees"].join("")}/`;
const MARKDOWN_FILE_NAME_PATTERN = /\b[\w.-]+\.md\b/i;
const WORKSPACE_PATH_PATTERN = /`?(?:\/(?:Users|home)\/[^\s`]+|~\/[^\s`]+|Labs\/[^\s`]+)`?/g;
const WORKSPACE_TAIL_PATTERN = /\blocal workspace\s+[^\s`]+(?:\/[^\s`]*)*/gi;

const railTimeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

type WorkbenchDayLabels = {
  recent?: string;
  today?: string;
  yesterday?: string;
};

function getWorkbenchDayLabels(labels?: WorkbenchDayLabels) {
  return {
    recent: labels?.recent ?? "Recent",
    today: labels?.today ?? "Today",
    yesterday: labels?.yesterday ?? "Yesterday",
  };
}

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
    WORKSPACE_PATH_PATTERN,
    (rawPath) => {
      const cleaned = rawPath.replace(/[`]/g, "").replace(/\/$/, "");
      const parts = cleaned.split("/").filter(Boolean);
      const tail = parts.slice(-2).join("/");
      if (!tail || cleaned.includes(HIDDEN_WORKTREE_DIR) || HOME_PATH_MARKER.test(cleaned)) {
        return "local workspace";
      }
      return tail;
    },
  );
  return sanitized
    .replace(WORKSPACE_TAIL_PATTERN, "local workspace")
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
    MARKDOWN_FILE_NAME_PATTERN.test(normalized) ||
    normalized.includes("<INSTRUCTIONS>") ||
    HOME_PATH_MARKER.test(normalized) ||
    normalized.length > 72;
  return looksGenerated && fallbackText ? fallbackText : normalized;
};

export const formatWorkbenchRailDay = (value?: string | null, labels?: WorkbenchDayLabels): string => {
  const dayLabels = getWorkbenchDayLabels(labels);
  if (!value) return dayLabels.recent;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return dayLabels.recent;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / 86_400_000);
  if (diffDays === 0) return dayLabels.today;
  if (diffDays === 1) return dayLabels.yesterday;
  return railDayFormatter.format(date);
};

export const formatWorkbenchRailTime = (value?: string | null): string => {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return railTimeFormatter.format(date);
};

export const formatWorkbenchGroupLabel = (value?: string | null, labels?: WorkbenchDayLabels): string => {
  const dayLabels = getWorkbenchDayLabels(labels);
  if (!value) return dayLabels.recent;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return dayLabels.recent;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / 86_400_000);
  if (diffDays === 0) return dayLabels.today;
  if (diffDays === 1) return dayLabels.yesterday;
  return railDayFormatter.format(date).toUpperCase();
};
