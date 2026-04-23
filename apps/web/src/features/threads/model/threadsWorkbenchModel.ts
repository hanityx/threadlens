import type { Messages } from "@/i18n";

export const THREAD_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEY = "po-thread-hard-delete-skip-confirm";
export const LEGACY_THREAD_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEY = "cmc-thread-hard-delete-skip-confirm";
const THREAD_PANEL_ACTIVE_MIN_HEIGHT = 640;

export function resolveThreadWorkbenchPanelHeight(options: {
  stackHeight?: number | null;
  detailHeight?: number | null;
  baselineHeight?: number | null;
  minHeight?: number;
}) {
  const {
    stackHeight = null,
    detailHeight = null,
    baselineHeight = null,
    minHeight = THREAD_PANEL_ACTIVE_MIN_HEIGHT,
  } = options;
  const measured = Math.max(Number(stackHeight || 0), Number(detailHeight || 0));
  return Math.max(minHeight, Number(baselineHeight || 0), Math.ceil(measured));
}

export function formatThreadSourceLabel(messages: Messages, source?: string | null) {
  if (source === "sessions") return messages.threadDetail.sourceSessions;
  if (source === "archive") return messages.threadDetail.sourceArchive;
  if (source === "history") return messages.threadDetail.sourceHistory;
  if (source === "tmp") return messages.threadDetail.sourceTemporary;
  return messages.threadDetail.fallbackTitlePrefix;
}

export function formatThreadRiskLabel(messages: Messages, risk?: string | null) {
  if (risk === "high") return messages.overview.reviewRiskHigh;
  if (risk === "medium") return messages.overview.reviewRiskMedium;
  if (risk === "low") return messages.overview.reviewRiskLow;
  return messages.overview.reviewMetaFallbackRisk;
}

export function formatThreadSourceSummary(
  messages: Messages,
  source?: string | null,
  score?: number | null,
  risk?: string | null,
) {
  return messages.threadDetail.nextThreadSourceTemplate
    .replace("{source}", formatThreadSourceLabel(messages, source))
    .replace("{score}", String(score ?? 0))
    .replace("{risk}", formatThreadRiskLabel(messages, risk));
}
