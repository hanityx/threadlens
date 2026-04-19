import type { Messages } from "../../i18n";
import type { ProviderActionSelection, ProviderSessionActionResult, ProviderSessionRow } from "../../types";
import { compactSessionTitle, formatBytesCompact } from "./helpers";
import { formatDateTime, formatProviderDisplayName } from "../../lib/helpers";

export function pickLargestSessionCandidates(rows: ProviderSessionRow[], limit = 2) {
  return [...rows].sort((left, right) => {
    const sizeDiff = Number(right.size_bytes || 0) - Number(left.size_bytes || 0);
    if (sizeDiff !== 0) return sizeDiff;
    return Date.parse(right.mtime || "") - Date.parse(left.mtime || "");
  }).slice(0, limit);
}

type BuildProvidersWorkspaceStateArgs = {
  messages: Messages;
  providerSessionRows: ProviderSessionRow[];
  selectedProviderFiles: Record<string, boolean>;
  emptySessionNextTitle: string;
  emptySessionNextPath: string;
  selectedSession: ProviderSessionRow | null;
  providerActionData: ProviderSessionActionResult | null | undefined;
  providerActionSelection: ProviderActionSelection | null | undefined;
};

export function buildProvidersWorkspaceState({
  messages,
  providerSessionRows,
  selectedProviderFiles,
  emptySessionNextTitle,
  emptySessionNextPath,
  selectedSession,
  providerActionData,
  providerActionSelection,
}: BuildProvidersWorkspaceStateArgs) {
  const largestSessionCandidates = pickLargestSessionCandidates(providerSessionRows, 2);
  const selectedSessionCount = Object.values(selectedProviderFiles).filter(Boolean).length;
  const emptyNextSessions = largestSessionCandidates.length
    ? largestSessionCandidates.map((candidate) => ({
        title: compactSessionTitle(
          candidate.display_title || candidate.probe.detected_title,
          candidate.session_id,
        ),
        path: candidate.file_path,
        description: `${formatProviderDisplayName(candidate.provider)} · ${formatBytesCompact(candidate.size_bytes)} · ${formatDateTime(candidate.mtime)} · ${messages.sessionDetail.emptyNextLargestInScope}`,
      }))
    : emptySessionNextTitle
      ? [{ title: emptySessionNextTitle, path: emptySessionNextPath, description: "" }]
      : [];

  const selectedSessionActionResult =
    selectedSession &&
    providerActionData &&
    providerActionSelection?.file_paths?.length === 1 &&
    providerActionSelection.file_paths[0] === selectedSession.file_path
      ? providerActionData
      : null;

  const sessionDetailKey = selectedSession?.file_path ?? "empty-session-detail";

  return {
    largestSessionCandidates,
    selectedSessionCount,
    emptyNextSessions,
    selectedSessionActionResult,
    sessionDetailKey,
  };
}
