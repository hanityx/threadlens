import type { UpdateCheckStatus } from "@threadlens/shared-contracts";
import type { Locale } from "../i18n/types.js";
import type { TuiMessages } from "../i18n/types.js";

export function buildUpdateNoticeLine(update: UpdateCheckStatus | null, messages?: TuiMessages): string | null {
  if (!update || !update.has_update || !update.latest_version) return null;
  if (messages) {
    return messages.common.updateAvailable(update.latest_version, update.current_version);
  }
  return `Update available: v${update.latest_version} · current v${update.current_version}`;
}

export function buildUpdateNoticeSummary(
  update: UpdateCheckStatus | null,
  messages?: TuiMessages,
  locale: Locale = "en",
): string | null {
  if (!update || !update.has_update) return null;
  if (locale !== "en" && messages) {
    return messages.common.updateSummaryFallback;
  }
  return update.release_summary?.trim() || update.release_title?.trim() || null;
}
