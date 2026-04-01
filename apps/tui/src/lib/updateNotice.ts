import type { UpdateCheckStatus } from "@threadlens/shared-contracts";

export function buildUpdateNoticeLine(update: UpdateCheckStatus | null): string | null {
  if (!update || !update.has_update || !update.latest_version) return null;
  return `Update available: v${update.latest_version} · current v${update.current_version}`;
}

export function buildUpdateNoticeSummary(update: UpdateCheckStatus | null): string | null {
  if (!update || !update.has_update) return null;
  return update.release_summary?.trim() || update.release_title?.trim() || null;
}
