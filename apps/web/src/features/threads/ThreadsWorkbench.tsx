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
  const selectedCount = reviewTargetIds.length;
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
              <span className="overview-note-label">thread</span>
            </div>
            <strong>Review &amp; Archive</strong>
            <p>Select, analyze, clean up in Codex.</p>
          </div>
          <div className="thread-status-grid">
            <article className="thread-status-card">
              <span>threads</span>
              <strong>{filteredCount}</strong>
            </article>
            {highRiskVisibleCount > 0 ? (
              <article className="thread-status-card is-warn">
                <span>high signal</span>
                <strong>{highRiskVisibleCount}</strong>
              </article>
            ) : null}
            {pinnedCount > 0 ? (
              <article className="thread-status-card">
                <span>pinned</span>
                <strong>{pinnedCount}</strong>
              </article>
            ) : null}
            {selectedCount > 0 ? (
              <article className="thread-status-card is-accent">
                <span>selected</span>
                <strong>{selectedCount}</strong>
              </article>
            ) : null}
            <article className={`thread-status-card ${dryRunReady ? "is-ready" : ""}`.trim()}>
              <span>dry-run</span>
              <strong>{dryRunReady ? "ready" : "—"}</strong>
            </article>
          </div>
          <section className="toolbar cleanup-toolbar">
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
              className="search-input"
            />
            <select
              className="filter-select"
              value={filterMode}
              onChange={(event) => setFilterMode(event.target.value as "all" | "high-risk" | "pinned")}
            >
              <option value="all">{messages.toolbar.all}</option>
              <option value="high-risk">{messages.toolbar.highRisk}</option>
              <option value="pinned">{messages.toolbar.pinned}</option>
            </select>
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
                  ? `${nextCleanupCandidate.source || "thread"} · risk ${nextCleanupCandidate.risk_score ?? 0} · ${nextCleanupCandidate.risk_level || "review"}`
                  : "open from threads or recent review rows"
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
              selectedIds={reviewTargetIds}
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
