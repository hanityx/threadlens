import { useMemo, useState } from "react";
import { Button } from "@/shared/ui/components/Button";
import { PanelHeader } from "@/shared/ui/components/PanelHeader";

import type { Messages } from "@/i18n";
import type {
  AnalyzeDeleteReport,
  CleanupPendingState,
  CleanupPreviewData,
  ThreadRow,
} from "@/shared/types";
import { formatBytes, prettyJson } from "@/shared/lib/format";

export interface ForensicsPanelProps {
  messages: Messages;
  threadActionsDisabled: boolean;
  selectedIds: string[];
  selectedThreadId: string;
  rows: ThreadRow[];
  busy: boolean;
  analyzeDelete: (ids: string[], sessionScanLimit?: number) => void;
  analysisData?: { session_scan_limit?: number; session_scan_candidates?: number };
  cleanupDryRun: (ids: string[]) => void;
  cleanupExecute: (ids: string[]) => void;
  cleanupData: CleanupPreviewData | null;
  pendingCleanup: CleanupPendingState | null;
  selectedImpactRows: AnalyzeDeleteReport[];
  analysisRaw: unknown;
  cleanupRaw: unknown;
  analyzeDeleteError: boolean;
  cleanupDryRunError: boolean;
  cleanupExecuteError: boolean;
  analyzeDeleteErrorMessage: string;
  cleanupDryRunErrorMessage: string;
  cleanupExecuteErrorMessage: string;
  initialCrossSessionView?: CrossSessionViewKey;
}

type ImpactDigest = {
  stateRefKinds: Array<"titles" | "pinned" | "ordering">;
  localCacheCount: number;
  sessionLogCount: number;
  projectBuckets: string[];
  bucketEmptyCount: number;
  bucketShrinkCount: number;
  workspaces: string[];
  strongLinks: number;
  mentionLinks: number;
  relatedThreads: number;
  strongSamples: CrossSessionSample[];
  mentionSamples: CrossSessionSample[];
  relatedSamples: CrossSessionSample[];
};

type CrossSessionSample = {
  thread_id: string;
  title?: string;
  direction: "outbound" | "inbound" | "both";
  strength: "strong" | "mention";
  evidence_kind:
    | "parent_thread_id"
    | "forked_from_id"
    | "new_thread_id"
    | "command_output"
    | "tool_output"
    | "search_text"
    | "copied_context"
    | "generic_mention";
  matched_field?: string;
  matched_event?: string;
  matched_value?: string;
  matched_excerpt?: string;
};

type SignalFactor = {
  label: string;
  points: number;
};

type SignalCriterion = {
  label: string;
  detail: string;
  points: number;
  showPoints?: boolean;
};

type SignalDigest = {
  row: ThreadRow | null;
  factors: SignalFactor[];
  contextInputs: SignalCriterion[];
  evidenceCriteria: SignalCriterion[];
  policyCriteria: SignalCriterion[];
};

type CrossSessionViewKey = "strong" | "mention" | "all" | null;

type ImpactDetailItem = {
  key: string;
  rowTitle: string;
  label: string;
  value: string;
};

function shouldRedactForensicsKey(key: string): boolean {
  const normalized = String(key || "").trim().toLowerCase();
  return (
    normalized === "confirm_token_expected" ||
    normalized === "matched_excerpt" ||
    normalized === "matched_value" ||
    normalized === "cwd" ||
    normalized === "roots" ||
    normalized === "path" ||
    normalized.endsWith("_path")
  );
}

function redactForensicsPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactForensicsPayload(entry));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      shouldRedactForensicsKey(key) ? undefined : redactForensicsPayload(nestedValue),
    ]),
  );
}

function redactForensicsText(text: string | null | undefined): string {
  const raw = String(text ?? "").trim();
  if (!raw) return "";
  let out = raw
    .replace(/\/Users\/[^\s"'`]+/g, "/user-root/<redacted>")
    .replace(/\/home\/[^\s"'`]+/g, "/user-root/<redacted>")
    .replace(
      /\b(sk-[A-Za-z0-9]{12,}|ghp_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,})\b/g,
      "<secret:redacted>",
    )
    .replace(
      /\b([A-Z0-9_]{2,}_(TOKEN|KEY|SECRET|PASSWORD))=([^\s"'`]+)/g,
      "$1=<redacted>",
    )
    .replace(
      /https?:\/\/[^\s"'`]*?(token|key|secret|password)=[^\s"'`]+/gi,
      "<redacted-url>",
    );
  const home = typeof process !== "undefined" && process?.env ? process.env.HOME ?? "" : "";
  if (home && out.includes(home)) {
    out = out.split(home).join("~");
  }
  return out;
}

function buildCrossSessionEvidence(sample: CrossSessionSample) {
  return {
    matchedField: redactForensicsText(sample.matched_field),
    matchedEvent: redactForensicsText(sample.matched_event),
    matchedValue: redactForensicsText(sample.matched_value),
    matchedExcerpt: redactForensicsText(sample.matched_excerpt),
  };
}

function buildCrossSessionReadableSummary(messages: Messages, sample: CrossSessionSample) {
  if (sample.evidence_kind === "parent_thread_id") {
    return messages.forensics.crossSessionReadableReasonParent;
  }
  if (sample.evidence_kind === "forked_from_id") {
    return messages.forensics.crossSessionReadableReasonFork;
  }
  if (sample.evidence_kind === "new_thread_id") {
    return messages.forensics.crossSessionReadableReasonNewThread;
  }
  if (sample.evidence_kind === "command_output") {
    return messages.forensics.crossSessionReadableReasonCommand;
  }
  if (sample.evidence_kind === "tool_output") {
    return messages.forensics.crossSessionReadableReasonTool;
  }
  if (sample.evidence_kind === "search_text") {
    return messages.forensics.crossSessionReadableReasonSearch;
  }
  if (sample.evidence_kind === "copied_context") {
    return messages.forensics.crossSessionReadableReasonCopied;
  }
  return messages.forensics.crossSessionReadableReasonGeneric;
}

function formatCrossSessionTitle(sample: CrossSessionSample) {
  const title = sample.title?.trim();
  if (title && title !== sample.thread_id) {
    return title;
  }
  return `thread ${sample.thread_id.slice(0, 8)}`;
}

function summarizeImpactRows(rows: AnalyzeDeleteReport[]): ImpactDigest {
  const stateRefKinds = new Set<ImpactDigest["stateRefKinds"][number]>();
  const projectBuckets = new Set<string>();
  const workspaces = new Set<string>();
  let localCacheCount = 0;
  let sessionLogCount = 0;
  let bucketEmptyCount = 0;
  let bucketShrinkCount = 0;
  const strongSamples = new Map<string, CrossSessionSample>();
  const mentionSamples = new Map<string, CrossSessionSample>();
  const relatedSamples = new Map<string, CrossSessionSample>();

  rows.forEach((row) => {
    row.parents?.forEach((parent) => {
      if (parent === "global-state:thread-titles") {
        stateRefKinds.add("titles");
      } else if (parent === "global-state:pinned-thread-ids") {
        stateRefKinds.add("pinned");
      } else if (parent === "global-state:thread-order") {
        stateRefKinds.add("ordering");
      } else if (parent.startsWith("project-bucket:")) {
        projectBuckets.add(parent.slice("project-bucket:".length));
      } else if (parent.startsWith("workspace:")) {
        workspaces.add(parent.slice("workspace:".length));
      }
    });

    row.impacts?.forEach((impact) => {
      const normalizedImpact = impact.toLowerCase();
      if (normalizedImpact.includes("cache file") && normalizedImpact.includes("removed")) {
        localCacheCount += 1;
      } else if (normalizedImpact.includes("session logs") && normalizedImpact.includes("stored separately")) {
        sessionLogCount += 1;
      } else if (impact.endsWith("bucket may become empty")) {
        bucketEmptyCount += 1;
      } else if (impact.startsWith("Thread count will decrease in bucket ")) {
        bucketShrinkCount += 1;
      }
    });

    row.cross_session_links?.strong_samples?.forEach((sample) => {
      if (!strongSamples.has(sample.thread_id)) {
        strongSamples.set(sample.thread_id, sample);
      }
      if (!relatedSamples.has(sample.thread_id)) {
        relatedSamples.set(sample.thread_id, sample);
      }
    });
    row.cross_session_links?.mention_samples?.forEach((sample) => {
      if (!mentionSamples.has(sample.thread_id)) {
        mentionSamples.set(sample.thread_id, sample);
      }
      if (!relatedSamples.has(sample.thread_id)) {
        relatedSamples.set(sample.thread_id, sample);
      }
    });
    row.cross_session_links?.related_samples?.forEach((sample) => {
      if (!relatedSamples.has(sample.thread_id)) {
        relatedSamples.set(sample.thread_id, sample);
      }
    });
  });

  return {
    stateRefKinds: Array.from(stateRefKinds),
    localCacheCount,
    sessionLogCount,
    projectBuckets: Array.from(projectBuckets).sort(),
    bucketEmptyCount,
    bucketShrinkCount,
    workspaces: Array.from(workspaces).sort(),
    strongLinks: strongSamples.size,
    mentionLinks: mentionSamples.size,
    relatedThreads: relatedSamples.size,
    strongSamples: Array.from(strongSamples.values()),
    mentionSamples: Array.from(mentionSamples.values()),
    relatedSamples: Array.from(relatedSamples.values()),
  };
}

function buildImpactDetailItems(messages: Messages, rows: AnalyzeDeleteReport[]): ImpactDetailItem[] {
  const seen = new Set<string>();
  const items: ImpactDetailItem[] = [];
  const addItem = (row: AnalyzeDeleteReport, label: string, rawValue: string, localize = false) => {
    const value = localize ? localizeImpactText(messages, rawValue) : rawValue.trim();
    if (!value) return;
    const key = `${label}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({
      key,
      rowTitle: row.title || row.id,
      label,
      value,
    });
  };

  rows.forEach((row) => {
    row.parents?.forEach((parent) => addItem(row, messages.forensics.impactRefs, parent));
    row.impacts?.forEach((impact) => addItem(row, messages.forensics.impactChanges, impact, true));
  });

  return items;
}

function localizeImpactText(messages: Messages, text: string): string {
  if (!text) return text;
  if (text.includes(" / ")) {
    return text
      .split(" / ")
      .map((part) => localizeImpactText(messages, part))
      .join(" / ");
  }
  if (text === "Not found in the current index") {
    return messages.forensics.impactSummaryNotFound;
  }
  if (text === "Little to no impact") {
    return messages.forensics.impactSummaryNone;
  }
  if (text === "Removed from sidebar title metadata") {
    return messages.forensics.impactChangeTitleMetadata;
  }
  if (text === "Removed from the pinned list") {
    return messages.forensics.impactChangePinned;
  }
  if (text === "Removed from sidebar ordering") {
    return messages.forensics.impactChangeOrdering;
  }
  if (text === "Local conversation cache file (.data) will be removed") {
    return messages.forensics.impactChangeLocalCache;
  }
  if (text === "Session logs are stored separately and remain unless cleaned up separately") {
    return messages.forensics.impactChangeSeparateLogs;
  }
  if (text.endsWith(" bucket may become empty")) {
    return messages.forensics.impactChangeBucketEmpty.replace(
      "{bucket}",
      text.slice(0, -" bucket may become empty".length),
    );
  }
  if (text.startsWith("Thread count will decrease in bucket ")) {
    return messages.forensics.impactChangeBucketShrink.replace(
      "{bucket}",
      text.slice("Thread count will decrease in bucket ".length),
    );
  }
  return text;
}

function localizeRiskLevel(messages: Messages, level: string | null | undefined): string {
  if (level === "high") return messages.forensics.riskLevelHigh;
  if (level === "medium") return messages.forensics.riskLevelMedium;
  if (level === "low") return messages.forensics.riskLevelLow;
  return messages.forensics.riskLevelUnknown;
}

function resolveSignalRow(rows: ThreadRow[], selectedIds: string[], selectedThreadId: string): ThreadRow | null {
  const candidates = rows.filter((row) => selectedIds.includes(row.thread_id));
  if (candidates.length === 0) return null;
  const focused = selectedThreadId ? candidates.find((row) => row.thread_id === selectedThreadId) : null;
  if (focused) return focused;
  return [...candidates].sort((left, right) => {
    const riskDiff = Number(right.risk_score ?? 0) - Number(left.risk_score ?? 0);
    if (riskDiff !== 0) return riskDiff;
    return Date.parse(right.timestamp || "") - Date.parse(left.timestamp || "");
  })[0] ?? null;
}

function summarizeSignal(messages: Messages, row: ThreadRow | null): SignalDigest {
  if (!row) {
    return {
      row: null,
      factors: [],
      contextInputs: [],
      evidenceCriteria: [],
      policyCriteria: [],
    };
  }

  const tags = new Set(row.risk_tags ?? []);
  const factors: SignalFactor[] = [];
  const isInternal = tags.has("internal");

  if (isInternal) {
    factors.push({ label: messages.threadsTable.riskTagInternal, points: 12 });
  }
  if (tags.has("ctx-critical")) {
    factors.push({ label: messages.threadsTable.riskTagContextCritical, points: 40 });
  } else if (tags.has("ctx-high")) {
    factors.push({ label: messages.threadsTable.riskTagContextHigh, points: 28 });
  } else if (tags.has("ctx-medium")) {
    factors.push({ label: messages.threadsTable.riskTagContextMedium, points: 12 });
  }
  if (tags.has("stale")) {
    factors.push({ label: messages.threadsTable.riskTagStale, points: isInternal ? 8 : 4 });
  }
  if (tags.has("orphan-candidate")) {
    factors.push({ label: messages.threadsTable.riskTagOrphanCandidate, points: 14 });
  }
  if (tags.has("no-cwd")) {
    factors.push({ label: messages.threadsTable.riskTagNoWorkspace, points: 14 });
  }

  const scored = factors.reduce((sum, factor) => sum + factor.points, 0);
  const actual = Number(row.risk_score ?? 0);
  const activityAgeMin = Number(row.activity_age_min ?? 0);
  const activityDays = activityAgeMin > 0 ? Math.max(1, Math.round(activityAgeMin / 1440)) : 0;
  const sessionBytes = Number(row.session_bytes ?? 0);
  const contextScore = Number(row.context_score ?? 0);
  const sessionFormatOk =
    row.session_format_ok === undefined || row.session_format_ok === null ? null : Boolean(row.session_format_ok);

  if (actual > scored) {
    factors.push({
      label: messages.forensics.signalOtherFactors,
      points: actual - scored,
    });
  }

  const contextBandTag = tags.has("ctx-critical")
    ? "ctx-critical"
    : tags.has("ctx-high")
      ? "ctx-high"
      : tags.has("ctx-medium")
        ? "ctx-medium"
        : null;
  const contextBandLabel = contextBandTag === "ctx-critical"
    ? messages.threadsTable.riskTagContextCritical
    : contextBandTag === "ctx-high"
      ? messages.threadsTable.riskTagContextHigh
      : contextBandTag === "ctx-medium"
        ? messages.threadsTable.riskTagContextMedium
        : messages.forensics.signalCriterionNotApplied;
  const contextBandPoints = contextBandTag === "ctx-critical" ? 40 : contextBandTag === "ctx-high" ? 28 : contextBandTag === "ctx-medium" ? 12 : 0;

  const contextInputs: SignalCriterion[] = [
    {
      label: messages.forensics.signalFileSizeLabel,
      detail: sessionBytes ? formatBytes(sessionBytes) : "0 B",
      points: 0,
      showPoints: false,
    },
    {
      label: messages.forensics.signalFormatPenaltyLabel,
      detail:
        sessionFormatOk === null
          ? messages.forensics.signalCriterionUnknown
          : sessionFormatOk
            ? messages.forensics.signalCriterionClear
            : messages.forensics.signalCriterionDetected,
      points: sessionFormatOk === false ? 12 : 0,
      showPoints: false,
    },
    {
      label: messages.forensics.signalContextCard,
      detail: `${contextScore} · ${messages.forensics.signalContextInputSummary}`,
      points: 0,
      showPoints: false,
    },
  ];

  const evidenceCriteria: SignalCriterion[] = [
    {
      label: messages.forensics.signalContextBandLabel,
      detail: contextBandTag ? `${contextBandLabel} (${contextScore})` : `${messages.forensics.signalCriterionNotApplied} (${contextScore})`,
      points: contextBandPoints,
      showPoints: true,
    },
    {
      label: messages.threadsTable.riskTagNoWorkspace,
      detail: tags.has("no-cwd")
        ? messages.forensics.signalCriterionApplied
        : messages.forensics.signalCriterionNotApplied,
      points: tags.has("no-cwd") ? 14 : 0,
      showPoints: true,
    },
    {
      label: messages.threadsTable.riskTagStale,
      detail:
        tags.has("stale") && activityDays
          ? messages.forensics.signalFactIdleDays.replace("{count}", String(activityDays))
          : messages.forensics.signalCriterionNotApplied,
      points: tags.has("stale") ? (isInternal ? 8 : 4) : 0,
      showPoints: true,
    },
  ];

  const policyCriteria: SignalCriterion[] = [
    {
      label: messages.threadsTable.riskTagInternal,
      detail: isInternal ? messages.forensics.signalCriterionApplied : messages.forensics.signalCriterionNotApplied,
      points: isInternal ? 12 : 0,
      showPoints: true,
    },
    {
      label: messages.threadsTable.riskTagOrphanCandidate,
      detail: tags.has("orphan-candidate")
        ? messages.forensics.signalCriterionApplied
        : messages.forensics.signalCriterionNotApplied,
      points: tags.has("orphan-candidate") ? 14 : 0,
      showPoints: true,
    },
    {
      label: messages.forensics.signalOtherFactors,
      detail: actual > scored ? messages.forensics.signalCriterionApplied : messages.forensics.signalCriterionNotApplied,
      points: actual > scored ? actual - scored : 0,
      showPoints: true,
    },
  ];

  return {
    row,
    factors,
    contextInputs,
    evidenceCriteria,
    policyCriteria,
  };
}

export function ForensicsPanel(props: ForensicsPanelProps) {
  const {
    messages,
    threadActionsDisabled,
    selectedIds,
    selectedThreadId,
    rows,
    busy,
    analyzeDelete,
    cleanupDryRun,
    cleanupData,
    selectedImpactRows,
    analysisData,
    cleanupRaw,
    analyzeDeleteError,
    cleanupDryRunError,
    cleanupExecuteError,
    analyzeDeleteErrorMessage,
    cleanupDryRunErrorMessage,
    cleanupExecuteErrorMessage,
    initialCrossSessionView,
  } = props;
  const [selectedCrossSessionView, setSelectedCrossSessionView] = useState<CrossSessionViewKey>(initialCrossSessionView ?? null);
  const canRetryForensics = !threadActionsDisabled && !busy && selectedIds.length > 0;
  const signalRow = resolveSignalRow(rows, selectedIds, selectedThreadId);
  const signalDigest = useMemo(
    () => summarizeSignal(messages, signalRow),
    [messages, signalRow],
  );
  const impactReady = selectedImpactRows.length > 0;
  const impactDigest = useMemo(
    () => summarizeImpactRows(selectedImpactRows),
    [selectedImpactRows],
  );
  const impactDetailItems = useMemo(
    () => buildImpactDetailItems(messages, selectedImpactRows),
    [messages, selectedImpactRows],
  );
  const scanLimit = analysisData?.session_scan_limit ?? 0;
  const scanCandidates = analysisData?.session_scan_candidates ?? 0;
  const canExpandScan = impactReady && scanLimit > 0 && scanCandidates >= scanLimit && scanLimit < 240;
  const signalFactorsSummary = signalDigest.factors.length
    ? signalDigest.factors.slice(0, 3).map((factor) => `${factor.label} +${factor.points}`).join(" · ")
    : messages.forensics.signalNoFactors;

  const cleanupPayloadForDisplay = redactForensicsPayload(cleanupRaw);
  const stateRefSummary = impactDigest.stateRefKinds.length
    ? impactDigest.stateRefKinds
        .map((kind) => {
          if (kind === "titles") {
            return messages.forensics.impactStateRefTitles;
          }
          if (kind === "pinned") {
            return messages.forensics.impactStateRefPinned;
          }
          return messages.forensics.impactStateRefOrdering;
        })
        .join(" · ")
    : messages.forensics.impactStateRefsNone;
  const localStorageSummary = [
    `${messages.forensics.impactRemovedFilesCard} ${impactDigest.localCacheCount}`,
    `${messages.forensics.impactSeparateFilesCard} ${impactDigest.sessionLogCount}`,
  ].join(" · ");
  const localReachSummary = [
    impactDigest.projectBuckets.length
      ? messages.forensics.impactBucketsLinked.replace("{count}", String(impactDigest.projectBuckets.length))
      : "",
    impactDigest.workspaces.length
      ? messages.forensics.impactWorkspacesLinked.replace("{count}", String(impactDigest.workspaces.length))
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const crossSessionSummaryLine = `${messages.forensics.crossSessionStrongCard} ${impactDigest.strongLinks} · ${messages.forensics.crossSessionMentionCard} ${impactDigest.mentionLinks}`;
  const crossSessionViewTitle =
    selectedCrossSessionView === "strong"
      ? messages.forensics.crossSessionStrongCard
      : selectedCrossSessionView === "mention"
        ? messages.forensics.crossSessionMentionCard
        : messages.forensics.crossSessionRelatedCard;
  const crossSessionViewHint =
    selectedCrossSessionView === "strong"
      ? messages.forensics.crossSessionStrongHint
      : selectedCrossSessionView === "mention"
        ? messages.forensics.crossSessionMentionHint
        : messages.forensics.crossSessionRelatedHint;
  const crossSessionViewItems =
    selectedCrossSessionView === "strong"
      ? impactDigest.strongSamples
      : selectedCrossSessionView === "mention"
        ? impactDigest.mentionSamples
        : impactDigest.relatedSamples;
  const crossSessionViewEmpty =
    selectedCrossSessionView === "strong"
      ? messages.forensics.crossSessionStrongNone
      : selectedCrossSessionView === "mention"
        ? messages.forensics.crossSessionMentionNone
        : messages.forensics.crossSessionNone;
  const formatCrossSessionDirection = (direction: CrossSessionSample["direction"]) => {
    if (direction === "both") return messages.forensics.crossSessionDirectionBoth;
    if (direction === "inbound") return messages.forensics.crossSessionDirectionInbound;
    return messages.forensics.crossSessionDirectionOutbound;
  };
  const formatCrossSessionEvidenceKind = (kind: CrossSessionSample["evidence_kind"]) => {
    if (kind === "parent_thread_id") return messages.forensics.crossSessionEvidenceKindParent;
    if (kind === "forked_from_id") return messages.forensics.crossSessionEvidenceKindFork;
    if (kind === "new_thread_id") return messages.forensics.crossSessionEvidenceKindNewThread;
    if (kind === "command_output") return messages.forensics.crossSessionEvidenceKindCommand;
    if (kind === "tool_output") return messages.forensics.crossSessionEvidenceKindTool;
    if (kind === "search_text") return messages.forensics.crossSessionEvidenceKindSearch;
    if (kind === "copied_context") return messages.forensics.crossSessionEvidenceKindCopied;
    return messages.forensics.crossSessionEvidenceKindGeneric;
  };
  const formatCrossSessionReason = (sample: CrossSessionSample) => {
    if (sample.evidence_kind === "parent_thread_id") return messages.forensics.crossSessionEvidenceReasonParent;
    if (sample.evidence_kind === "forked_from_id") return messages.forensics.crossSessionEvidenceReasonFork;
    if (sample.evidence_kind === "new_thread_id") return messages.forensics.crossSessionEvidenceReasonNewThread;
    if (sample.evidence_kind === "command_output") return messages.forensics.crossSessionEvidenceReasonCommand;
    if (sample.evidence_kind === "tool_output") return messages.forensics.crossSessionEvidenceReasonTool;
    if (sample.evidence_kind === "search_text") return messages.forensics.crossSessionEvidenceReasonSearch;
    if (sample.evidence_kind === "copied_context") return messages.forensics.crossSessionEvidenceReasonCopied;
    return sample.strength === "strong"
      ? messages.forensics.crossSessionEvidenceReasonStrong
      : messages.forensics.crossSessionEvidenceReasonMention;
  };
  const toggleCrossSessionView = (nextView: Exclude<CrossSessionViewKey, null>) => {
    setSelectedCrossSessionView((current) => (current === nextView ? null : nextView));
  };
  return (
    <section
      className={`panel impact-panel thread-review-panel ${selectedIds.length === 0 ? "is-empty-state" : ""}`.trim()}
    >
      <PanelHeader title={messages.forensics.title} />
      <div className="impact-body">
        <div className="impact-list">
          {signalRow ? (
            <div className="thread-review-impact-strip">
              <div className="thread-review-impact-strip-head">
                <span>{messages.forensics.signalBreakdownTitle}</span>
                <strong>{`${signalRow.risk_score ?? 0} · ${localizeRiskLevel(messages, signalRow.risk_level)}`}</strong>
              </div>
              <p className="thread-review-impact-strip-reasons">
                <span>{messages.forensics.signalDriversLabel}</span>
                {signalFactorsSummary}
              </p>
              {impactReady && impactDigest.strongLinks > 0 ? (
                <p className="thread-review-impact-strip-reasons thread-review-signal-cross-note">
                  {messages.forensics.signalCrossSessionNote.replace("{count}", String(impactDigest.strongLinks))}
                </p>
              ) : null}
              <details className="thread-review-impact-evidence-details">
                <summary>{messages.forensics.signalDetailsTitle}</summary>
                <div className="thread-review-impact-evidence-body">
                  <div className="thread-review-impact-criteria-group">
                    <p className="thread-review-impact-note">
                      <span>{messages.forensics.signalEstimatesLabel}</span>
                    </p>
                    <div className="thread-review-impact-criteria-list">
                      {signalDigest.contextInputs.map((criterion) => (
                        <p key={`context-${criterion.label}`} className="thread-review-impact-note thread-review-impact-criteria-row">
                          <span>{criterion.label}</span>
                          <strong>{criterion.detail}</strong>
                          {criterion.showPoints ? <em>{`+${criterion.points}`}</em> : null}
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className="thread-review-impact-criteria-group">
                    <p className="thread-review-impact-note">
                      <span>{messages.forensics.signalCriteriaLabel}</span>
                    </p>
                    <div className="thread-review-impact-criteria-list">
                      {[...signalDigest.evidenceCriteria, ...signalDigest.policyCriteria].map((criterion) => (
                        <p key={`criteria-${criterion.label}`} className="thread-review-impact-note thread-review-impact-criteria-row">
                          <span>{criterion.label}</span>
                          <strong>{criterion.detail}</strong>
                          {criterion.showPoints ? <em>{`+${criterion.points}`}</em> : null}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              </details>
            </div>
          ) : null}

          {!impactReady ? (
            <div className="thread-review-empty-guide">
              <article>
                <strong>{messages.forensics.emptyGuidePickTitle}</strong>
                <p>{messages.forensics.emptyGuidePickBody}</p>
              </article>
              <article>
                <strong>{messages.forensics.emptyGuideInspectTitle}</strong>
                <p>{messages.forensics.emptyGuideInspectBody}</p>
              </article>
            </div>
          ) : (
            <>
              <div className="thread-review-impact-strip">
                <div className="thread-review-impact-strip-head">
                  <span>{messages.forensics.localImpactTitle}</span>
                  <strong>{messages.forensics.localImpactSummary}</strong>
                </div>
                <p className="thread-review-impact-strip-scope">{messages.forensics.impactScopeNote}</p>
                <div className="thread-review-impact-strip-grid">
                  <article className="thread-review-impact-strip-card">
                    <span>{messages.forensics.impactStateRefsCard}</span>
                    <strong>{impactDigest.stateRefKinds.length}</strong>
                    <p>{stateRefSummary}</p>
                  </article>
                  <article className="thread-review-impact-strip-card">
                    <span>{messages.forensics.localImpactStorageCard}</span>
                    <strong>{impactDigest.localCacheCount + impactDigest.sessionLogCount}</strong>
                    <p>{localStorageSummary}</p>
                  </article>
                  <article className="thread-review-impact-strip-card">
                    <span>{messages.forensics.localImpactReachCard}</span>
                    <strong>{impactDigest.projectBuckets.length + impactDigest.workspaces.length}</strong>
                    <p>{localReachSummary || messages.forensics.localImpactReachNone}</p>
                  </article>
                </div>
              </div>
              <div className="thread-review-impact-strip">
                <div className="thread-review-impact-strip-head">
                  <span>{messages.forensics.crossSessionTitle}</span>
                  <strong>{messages.forensics.crossSessionSummaryTitle}</strong>
                </div>
                {scanLimit > 0 ? (
                  <div className="thread-review-scan-meta">
                    <span>{messages.forensics.crossSessionScannedLabel.replace("{count}", String(scanCandidates))}</span>
                    {canExpandScan ? (
                      <button
                        type="button"
                        className="thread-review-scan-expand-btn"
                        disabled={busy || threadActionsDisabled}
                        onClick={() => analyzeDelete(selectedIds, 240)}
                      >
                        {messages.forensics.crossSessionExpandScan}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <article className="thread-review-impact-summary-card">
                  <span>{messages.forensics.crossSessionSummaryCard}</span>
                  <strong>{impactDigest.relatedThreads}</strong>
                  <p>{crossSessionSummaryLine}</p>
                </article>
                <div className="thread-review-impact-filter-row" role="group" aria-label={messages.forensics.crossSessionFilterLabel}>
                  <button
                    type="button"
                    className={`thread-review-impact-filter-btn ${selectedCrossSessionView === "strong" ? "is-active" : ""}`.trim()}
                    aria-pressed={selectedCrossSessionView === "strong"}
                    onClick={() => toggleCrossSessionView("strong")}
                  >
                    {messages.forensics.crossSessionStrongCard}
                    {impactDigest.strongLinks > 0 ? (
                      <span className="cross-link-count">{impactDigest.strongLinks}</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className={`thread-review-impact-filter-btn ${selectedCrossSessionView === "mention" ? "is-active" : ""}`.trim()}
                    aria-pressed={selectedCrossSessionView === "mention"}
                    onClick={() => toggleCrossSessionView("mention")}
                  >
                    {messages.forensics.crossSessionMentionCard}
                    {impactDigest.mentionLinks > 0 ? (
                      <span className="cross-link-count">{impactDigest.mentionLinks}</span>
                    ) : null}
                  </button>
                </div>
                {selectedCrossSessionView ? (
                  <div className="thread-review-impact-drawer">
                    <p className="thread-review-impact-drawer-summary cross-link-drawer-hint">{crossSessionViewHint}</p>
                    {crossSessionViewItems.length ? (
                      <ul className="thread-review-impact-drawer-list">
                        {crossSessionViewItems.map((sample) => {
                          const evidence = buildCrossSessionEvidence(sample);
                          const hasReadableEvidence = Boolean(
                            evidence.matchedField || evidence.matchedEvent || evidence.matchedValue || evidence.matchedExcerpt,
                          );
                          const hasExtraValue = Boolean(
                            evidence.matchedValue && evidence.matchedValue !== evidence.matchedExcerpt,
                          );
                          return (
                            <li key={`${selectedCrossSessionView}-${sample.thread_id}`}>
                              <div className="cross-link-item-header">
                                <div className="cross-link-item-title-row">
                                  <strong className="cross-link-item-title">{formatCrossSessionTitle(sample)}</strong>
                                  <span className={`cross-link-direction cross-link-direction-${sample.direction}`}>
                                    {formatCrossSessionDirection(sample.direction)}
                                  </span>
                                </div>
                                <p className="cross-link-item-reason">{formatCrossSessionReason(sample)}</p>
                              </div>
                              {hasReadableEvidence ? (
                                <div className="thread-review-impact-evidence-card">
                                  <p className="thread-review-impact-note">
                                    <span>{messages.forensics.crossSessionTechnicalDetails}</span>
                                    {buildCrossSessionReadableSummary(messages, sample)}
                                  </p>
                                  {evidence.matchedExcerpt ? (
                                    <>
                                      <p className="thread-review-impact-note">
                                        <span>{messages.forensics.crossSessionMatchedExcerptLabel}</span>
                                      </p>
                                      <pre className="cross-link-excerpt">{evidence.matchedExcerpt}</pre>
                                    </>
                                  ) : null}
                                  <details className="thread-review-impact-evidence-meta">
                                    <summary>{messages.forensics.crossSessionMetadataDetails}</summary>
                                    <div className="thread-review-impact-evidence-body">
                                      {sample.thread_id ? (
                                        <p className="thread-review-impact-note">
                                          <span>ID</span>
                                          {sample.thread_id}
                                        </p>
                                      ) : null}
                                      {evidence.matchedEvent ? (
                                        <p className="thread-review-impact-note">
                                          <span>{messages.forensics.crossSessionMatchedEventLabel}</span>
                                          {evidence.matchedEvent}
                                        </p>
                                      ) : null}
                                      {evidence.matchedField ? (
                                        <p className="thread-review-impact-note">
                                          <span>{messages.forensics.crossSessionMatchedFieldLabel}</span>
                                          {evidence.matchedField}
                                        </p>
                                      ) : null}
                                      {hasExtraValue ? (
                                        <p className="thread-review-impact-note">
                                          <span>{messages.forensics.crossSessionMatchedValueLabel}</span>
                                          {evidence.matchedValue}
                                        </p>
                                      ) : null}
                                    </div>
                                  </details>
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="thread-review-impact-drawer-summary">{crossSessionViewEmpty}</p>
                    )}
                  </div>
                ) : (
                  <p className="thread-review-impact-drawer-summary">{messages.forensics.crossSessionPickerHint}</p>
                )}
              </div>
              {impactDetailItems.length > 0 ? (
                <details className="detail-section">
                  <summary>{messages.forensics.impactRowsDetailTitle}</summary>
                  <div className="detail-section-body">
                    <p className="thread-review-impact-drawer-summary">{messages.forensics.impactRowsDetailHint}</p>
                    <ul>
                      {impactDetailItems.slice(0, 12).map((item) => (
                        <li key={item.key}>
                          <div className="thread-review-impact-copy">
                            <strong>{item.rowTitle}</strong>
                            <p className="thread-review-impact-note">
                              <span>{item.label}</span>
                              {item.value}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
              ) : null}
            </>
          )}
        </div>

        {threadActionsDisabled ? <p className="sub-hint">{messages.forensics.backendDownHint}</p> : null}

        {!threadActionsDisabled && (analyzeDeleteError || cleanupDryRunError || cleanupExecuteError) ? (
          <div className="error-box">
            <div>{messages.errors.analysisDryRun}</div>
            {analyzeDeleteErrorMessage ? <div className="mono-sub">{analyzeDeleteErrorMessage}</div> : null}
            {cleanupDryRunErrorMessage ? <div className="mono-sub">{cleanupDryRunErrorMessage}</div> : null}
            {cleanupExecuteErrorMessage ? <div className="mono-sub">{cleanupExecuteErrorMessage}</div> : null}
            <div className="sub-toolbar action-toolbar">
              <Button
                variant="outline"
                disabled={!canRetryForensics}
                onClick={() => analyzeDelete(selectedIds)}
              >
                {messages.forensics.retryImpact}
              </Button>
              <Button
                variant="outline"
                disabled={!canRetryForensics}
                onClick={() => cleanupDryRun(selectedIds)}
              >
                {messages.forensics.retryDryRun}
              </Button>
            </div>
            {!threadActionsDisabled && selectedIds.length === 0 ? (
              <div className="sub-hint">{messages.forensics.retryNeedsSelection}</div>
            ) : null}
          </div>
        ) : null}

        {cleanupRaw ? (
          <details className="detail-section">
            <summary>{messages.forensics.technicalPayload}</summary>
            <div className="detail-section-body">
              {cleanupRaw ? (
                <details>
                  <summary>{cleanupData?.mode === "execute" ? messages.forensics.rawExecute : messages.forensics.rawDryRun}</summary>
                  <pre>{prettyJson(cleanupPayloadForDisplay)}</pre>
                </details>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>
    </section>
  );
}
