import { useEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "../../app/AppContext";
import {
  buildThreadCleanupSelectionKey,
  THREAD_CLEANUP_DEFAULT_OPTIONS,
} from "../../hooks/appDataUtils";
import { ThreadsTable } from "./ThreadsTable";
import { ThreadDetailSlot } from "./ThreadDetailSlot";
import { ThreadsForensicsSlot } from "./ThreadsForensicsSlot";

const THREAD_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEY = "po-thread-hard-delete-skip-confirm";
const LEGACY_THREAD_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEY = "cmc-thread-hard-delete-skip-confirm";

function formatThreadSourceLabel(messages: ReturnType<typeof useAppContext>["messages"], source?: string | null) {
  if (source === "sessions") return messages.threadDetail.sourceSessions;
  if (source === "archive") return messages.threadDetail.sourceArchive;
  if (source === "history") return messages.threadDetail.sourceHistory;
  if (source === "tmp") return messages.threadDetail.sourceTemporary;
  return messages.threadDetail.fallbackTitlePrefix;
}

function formatThreadRiskLabel(messages: ReturnType<typeof useAppContext>["messages"], risk?: string | null) {
  if (risk === "high") return messages.overview.reviewRiskHigh;
  if (risk === "medium") return messages.overview.reviewRiskMedium;
  if (risk === "low") return messages.overview.reviewRiskLow;
  return messages.overview.reviewMetaFallbackRisk;
}

function formatThreadSourceSummary(
  messages: ReturnType<typeof useAppContext>["messages"],
  source?: string | null,
  score?: number | null,
  risk?: string | null,
) {
  return messages.threadDetail.nextThreadSourceTemplate
    .replace("{source}", formatThreadSourceLabel(messages, source))
    .replace("{score}", String(score ?? 0))
    .replace("{risk}", formatThreadRiskLabel(messages, risk));
}

export function ThreadsWorkbench() {
  const {
    messages,
    threadSearchInputRef,
    query,
    setQuery,
    filterMode,
    setFilterMode,
    visibleRows,
    filteredRows,
    selectedIds,
    cleanupData,
    pendingCleanup,
    selectedImpactRows,
    analysisData,
    analysisRaw,
    cleanupRaw,
    showForensics,
    threads,
    threadsLoading,
    selected,
    setSelected,
    selectedThreadId,
    setSelectedThreadId,
    allFilteredSelected,
    toggleSelectAllFiltered,
    busy,
    showRuntimeBackendDegraded,
    bulkPin,
    bulkUnpin,
    bulkArchive,
    analyzeDelete,
    cleanupDryRun,
    cleanupExecute,
    analyzeDeleteError,
    cleanupDryRunError,
    cleanupExecuteError,
    analyzeDeleteErrorMessage,
    cleanupDryRunErrorMessage,
    cleanupExecuteErrorMessage,
    selectedThread,
    highRiskCount,
    recentThreadTitle,
    searchThreadContext,
    threadDetailLoading,
    selectedThreadDetail,
    threadTranscriptData,
    threadTranscriptLoading,
    threadTranscriptLimit,
    setThreadTranscriptLimit,
    rows,
  } = useAppContext();

  const reviewTargetIds = selectedIds.length > 0 ? selectedIds : selectedThreadId ? [selectedThreadId] : [];
  const reviewTargetSet = new Set(reviewTargetIds);
  const reviewImpactRows = (analysisData?.reports ?? []).filter((row) => reviewTargetSet.has(row.id));
  const tableSelectionKey = buildThreadCleanupSelectionKey(selectedIds, THREAD_CLEANUP_DEFAULT_OPTIONS);
  const reviewSelectionKey = buildThreadCleanupSelectionKey(reviewTargetIds, THREAD_CLEANUP_DEFAULT_OPTIONS);
  const visibleCount = visibleRows.length;
  const filteredCount = filteredRows.length;
  const selectedCount = selectedIds.length;
  const dryRunReady = Boolean(
    pendingCleanup?.confirmToken &&
    pendingCleanup.selectionKey === reviewSelectionKey &&
    cleanupData?.mode !== "execute",
  );
  const tableDryRunReady = Boolean(
    pendingCleanup?.confirmToken &&
    pendingCleanup.selectionKey === tableSelectionKey &&
    cleanupData?.mode !== "execute",
  );
  const selectedImpactCount = reviewImpactRows.length;
  const highRiskVisibleCount = visibleRows.filter((r) => (r.risk_score ?? 0) >= 70).length;
  const pinnedCount = visibleRows.filter((r) => r.is_pinned).length;
  const nextCleanupCandidate = useMemo(
    () =>
      [...visibleRows].sort((left, right) => {
        const riskDiff = Number(right.risk_score || 0) - Number(left.risk_score || 0);
        if (riskDiff !== 0) return riskDiff;
        if (left.is_pinned !== right.is_pinned) return Number(right.is_pinned) - Number(left.is_pinned);
        return Date.parse(right.timestamp || "") - Date.parse(left.timestamp || "");
      })[0] ?? null,
    [visibleRows],
  );
  const threadSideStackRef = useRef<HTMLDivElement | null>(null);
  const [activePanelHeight, setActivePanelHeight] = useState<number | null>(null);
  const [hardDeleteConfirmOpen, setHardDeleteConfirmOpen] = useState(false);
  const [hardDeleteSkipConfirmChecked, setHardDeleteSkipConfirmChecked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const raw =
        window.localStorage.getItem(THREAD_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEY) ??
        window.localStorage.getItem(LEGACY_THREAD_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEY) ??
        "";
      return raw === "1" || raw === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        THREAD_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEY,
        hardDeleteSkipConfirmChecked ? "1" : "0",
      );
    } catch {
      // ignore persistence failures
    }
  }, [hardDeleteSkipConfirmChecked]);

  const requestHardDeleteConfirm = () => {
    if (hardDeleteSkipConfirmChecked) {
      cleanupExecute(selectedIds);
      return;
    }
    setHardDeleteConfirmOpen(true);
  };

  const confirmHardDelete = () => {
    setHardDeleteConfirmOpen(false);
    cleanupExecute(selectedIds);
  };

  const cancelHardDeleteConfirm = () => {
    setHardDeleteConfirmOpen(false);
  };

  useEffect(() => {
    if (!showForensics || !selectedThreadId || !threadSideStackRef.current) {
      setActivePanelHeight(null);
      return;
    }

    const target = threadSideStackRef.current;
    let frameId = 0;

    const syncHeight = () => {
      const nextHeight = Math.ceil(target.getBoundingClientRect().height);
      setActivePanelHeight((current) => (current === nextHeight ? current : nextHeight));
    };

    syncHeight();

    const observer = new ResizeObserver(() => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        frameId = 0;
        syncHeight();
      });
    });

    observer.observe(target);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [selectedThreadId, showForensics]);

  return (
    <>
      <section className="page-section-header cleanup-command-shell">
        <div className="cleanup-command-body">
          <div className="thread-workflow-copy">
            <div className="thread-workflow-copy-eyebrow">
              <span className="overview-note-label">{messages.threadsTable.heroEyebrow}</span>
            </div>
            <strong>{messages.threadsTable.heroTitle}</strong>
            <p>{messages.threadsTable.heroBody}</p>
          </div>
          <div className="thread-status-grid">
            <article className="thread-status-card">
              <span>{messages.threadsTable.heroStatThreads}</span>
              <strong>{filteredCount}</strong>
            </article>
            {highRiskVisibleCount > 0 ? (
              <article className="thread-status-card is-warn">
                <span>{messages.threadsTable.heroStatHighSignal}</span>
                <strong>{highRiskVisibleCount}</strong>
              </article>
            ) : null}
            {pinnedCount > 0 ? (
              <article className="thread-status-card">
                <span>{messages.threadsTable.heroStatPinned}</span>
                <strong>{pinnedCount}</strong>
              </article>
            ) : null}
            {selectedCount > 0 ? (
              <article className="thread-status-card is-accent">
                <span>{messages.threadsTable.heroStatSelected}</span>
                <strong>{selectedCount}</strong>
              </article>
            ) : null}
            <article className={`thread-status-card ${dryRunReady ? "is-ready" : ""}`.trim()}>
              <span>{messages.threadsTable.heroStatDryRun}</span>
              <strong>{dryRunReady ? "ready" : "—"}</strong>
            </article>
          </div>
          <section className="toolbar cleanup-toolbar">
            <div className="toolbar-search-shell is-input">
              <span className="toolbar-search-prompt" aria-hidden="true">
                &gt;
              </span>
              <input
                ref={threadSearchInputRef}
                placeholder={messages.toolbar.searchThreads}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    (event.currentTarget as HTMLInputElement).blur();
                  }
                }}
                className="search-input toolbar-search-input"
              />
            </div>
            <div className="toolbar-search-shell is-select">
              <select
                className="filter-select toolbar-search-select"
                value={filterMode}
                onChange={(event) => setFilterMode(event.target.value as "all" | "high-risk" | "pinned")}
              >
                <option value="all">{messages.toolbar.all}</option>
                <option value="high-risk">{messages.toolbar.highRisk}</option>
                <option value="pinned">{messages.toolbar.pinned}</option>
              </select>
              <span className="toolbar-search-chevron" aria-hidden="true">
                ▾
              </span>
            </div>
          </section>
        </div>
      </section>

      <section
        className={`${showForensics ? "ops-layout" : "ops-layout single"} ${selectedThreadId ? "is-thread-active" : ""}`.trim()}
      >
        <ThreadsTable
          messages={messages}
          visibleRows={visibleRows}
          filteredRows={filteredRows}
          totalCount={threads.data?.total ?? rows.length}
          threadsLoading={threadsLoading}
          threadsError={threads.isError}
          selected={selected}
          setSelected={setSelected}
          selectedThreadId={selectedThreadId}
          setSelectedThreadId={setSelectedThreadId}
          allFilteredSelected={allFilteredSelected}
          toggleSelectAllFiltered={toggleSelectAllFiltered}
          selectedIds={selectedIds}
          selectedImpactCount={selectedImpactCount}
          dryRunReady={tableDryRunReady}
          dryRunReadyIds={pendingCleanup?.confirmToken && cleanupData?.mode !== "execute" ? pendingCleanup.ids : []}
          busy={busy}
          threadActionsDisabled={showRuntimeBackendDegraded}
          bulkArchive={bulkArchive}
          analyzeDelete={analyzeDelete}
          cleanupDryRun={cleanupDryRun}
          cleanupExecute={cleanupExecute}
          onRequestHardDeleteConfirm={requestHardDeleteConfirm}
          hardDeleteConfirmOpen={hardDeleteConfirmOpen}
          hardDeleteSkipConfirmChecked={hardDeleteSkipConfirmChecked}
          onToggleHardDeleteSkipConfirmChecked={setHardDeleteSkipConfirmChecked}
          onConfirmHardDelete={confirmHardDelete}
          onCancelHardDeleteConfirm={cancelHardDeleteConfirm}
          panelStyle={activePanelHeight ? { height: `${activePanelHeight}px` } : undefined}
        />
        {showForensics ? (
          <div className="thread-side-stack" ref={threadSideStackRef}>
            <ThreadDetailSlot
              messages={messages}
              selectedThread={selectedThread}
              selectedThreadId={selectedThreadId}
              openThreadById={setSelectedThreadId}
              visibleThreadCount={visibleRows.length}
              filteredThreadCount={filteredRows.length}
              nextThreadId={nextCleanupCandidate?.thread_id || ""}
              nextThreadTitle={nextCleanupCandidate ? recentThreadTitle(nextCleanupCandidate) : ""}
              nextThreadSource={
                nextCleanupCandidate
                  ? formatThreadSourceSummary(
                      messages,
                      nextCleanupCandidate.source,
                      nextCleanupCandidate.risk_score,
                      nextCleanupCandidate.risk_level,
                    )
                  : messages.threadDetail.emptyNextDefaultBody
              }
              searchContext={searchThreadContext}
              threadDetailLoading={threadDetailLoading}
              selectedThreadDetail={selectedThreadDetail}
              threadTranscriptData={threadTranscriptData}
              threadTranscriptLoading={threadTranscriptLoading}
              threadTranscriptLimit={threadTranscriptLimit}
              setThreadTranscriptLimit={setThreadTranscriptLimit}
              busy={busy}
              threadActionsDisabled={showRuntimeBackendDegraded}
              bulkPin={bulkPin}
              bulkUnpin={bulkUnpin}
              bulkArchive={bulkArchive}
              analyzeDelete={analyzeDelete}
              cleanupDryRun={cleanupDryRun}
              selectedIds={selectedIds}
            />
            <ThreadsForensicsSlot
              messages={messages}
              threadActionsDisabled={showRuntimeBackendDegraded}
              selectedIds={reviewTargetIds}
              rows={rows}
              busy={busy}
              analyzeDelete={analyzeDelete}
              cleanupDryRun={cleanupDryRun}
              cleanupExecute={cleanupExecute}
              cleanupData={cleanupData}
              pendingCleanup={pendingCleanup}
              selectedImpactRows={reviewImpactRows}
              analysisRaw={analysisRaw}
              cleanupRaw={cleanupRaw}
              analyzeDeleteError={analyzeDeleteError}
              cleanupDryRunError={cleanupDryRunError}
              cleanupExecuteError={cleanupExecuteError}
              analyzeDeleteErrorMessage={analyzeDeleteErrorMessage}
              cleanupDryRunErrorMessage={cleanupDryRunErrorMessage}
              cleanupExecuteErrorMessage={cleanupExecuteErrorMessage}
            />
          </div>
        ) : null}
      </section>
    </>
  );
}
