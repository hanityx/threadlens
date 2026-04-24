import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { useAppContext } from "@/app/AppContext";
import {
  buildThreadCleanupSelectionKey,
  THREAD_CLEANUP_DEFAULT_OPTIONS,
} from "@/shared/lib/appState";
import { ThreadsCommandShell } from "@/features/threads/components/ThreadsCommandShell";
import { ThreadsSideStack } from "@/features/threads/components/ThreadsSideStack";
import { ThreadsTable } from "@/features/threads/components/ThreadsTable";
import {
  formatThreadSourceSummary,
  LEGACY_THREAD_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEY,
  THREAD_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEY,
} from "@/features/threads/model/threadsWorkbenchModel";

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
  const highRiskVisibleCount = visibleRows.filter((row) => (row.risk_score ?? 0) >= 70).length;
  const pinnedCount = visibleRows.filter((row) => row.is_pinned).length;
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
  const threadForensicsPanelRef = useRef<HTMLDivElement | null>(null);
  const lastReadyCleanupTokenRef = useRef("");
  const panelHeightBaselineRef = useRef<number | null>(null);
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

  const focusThreadForAction = (ids: string[]) => {
    if (ids.length !== 1) return;
    if (selectedThreadId === ids[0]) return;
    setSelectedThreadId(ids[0]);
  };

  const runThreadAction = (action: (ids: string[]) => void, ids: string[]) => {
    focusThreadForAction(ids);
    action(ids);
  };

  const handleBulkArchive = (ids: string[]) => {
    runThreadAction(bulkArchive, ids);
  };

  const handleAnalyzeDelete = (ids: string[]) => {
    runThreadAction(analyzeDelete, ids);
  };

  const handleCleanupDryRun = (ids: string[]) => {
    runThreadAction(cleanupDryRun, ids);
  };

  const handleCleanupExecute = (ids: string[]) => {
    runThreadAction(cleanupExecute, ids);
  };

  const requestHardDeleteConfirm = () => {
    if (hardDeleteSkipConfirmChecked) {
      handleCleanupExecute(selectedIds);
      return;
    }
    setHardDeleteConfirmOpen(true);
  };

  const confirmHardDelete = () => {
    setHardDeleteConfirmOpen(false);
    handleCleanupExecute(selectedIds);
  };

  const cancelHardDeleteConfirm = () => {
    setHardDeleteConfirmOpen(false);
  };

  useEffect(() => {
    if (!showForensics || !selectedThreadId || !threadSideStackRef.current) {
      setActivePanelHeight(null);
      panelHeightBaselineRef.current = null;
      return;
    }

    const target = threadSideStackRef.current;
    const detailTarget = target.querySelector<HTMLElement>(".thread-review-panel");
    let frameId = 0;

    const syncHeight = () => {
      const nextHeight = resolveThreadWorkbenchPanelHeight({
        stackHeight: target.getBoundingClientRect().height,
        detailHeight: detailTarget?.getBoundingClientRect().height ?? null,
        baselineHeight: panelHeightBaselineRef.current,
      });
      panelHeightBaselineRef.current = Math.max(panelHeightBaselineRef.current ?? 0, nextHeight);
      const resolved = Math.max(nextHeight, panelHeightBaselineRef.current);
      setActivePanelHeight((current) => (current === resolved ? current : resolved));
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
    if (detailTarget && detailTarget !== target) {
      observer.observe(detailTarget);
    }

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [selectedThreadId, showForensics]);

  useEffect(() => {
    const readyToken =
      pendingCleanup?.confirmToken &&
      pendingCleanup.selectionKey === reviewSelectionKey &&
      cleanupData?.mode !== "execute"
        ? pendingCleanup.confirmToken
        : "";
    if (!readyToken) {
      lastReadyCleanupTokenRef.current = "";
      return;
    }
    if (lastReadyCleanupTokenRef.current === readyToken) return;
    lastReadyCleanupTokenRef.current = readyToken;
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      threadForensicsPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }, [cleanupData?.mode, pendingCleanup?.confirmToken, pendingCleanup?.selectionKey, reviewSelectionKey]);

  const detailProps = {
    messages,
    selectedThread,
    selectedThreadId: selectedThreadId || "",
    openThreadById: setSelectedThreadId,
    visibleThreadCount: visibleRows.length,
    filteredThreadCount: filteredRows.length,
    nextThreadId: nextCleanupCandidate?.thread_id || "",
    nextThreadTitle: nextCleanupCandidate ? recentThreadTitle(nextCleanupCandidate) : "",
    nextThreadSource: nextCleanupCandidate
      ? formatThreadSourceSummary(
          messages,
          nextCleanupCandidate.source,
          nextCleanupCandidate.risk_score,
          nextCleanupCandidate.risk_level,
        )
      : messages.threadDetail.emptyNextDefaultBody,
    searchContext: searchThreadContext,
    threadDetailLoading,
    selectedThreadDetail,
    threadTranscriptData,
    threadTranscriptLoading,
    threadTranscriptLimit,
    setThreadTranscriptLimit,
    busy,
    threadActionsDisabled: showRuntimeBackendDegraded,
    bulkPin,
    bulkUnpin,
    bulkArchive: handleBulkArchive,
    analyzeDelete: handleAnalyzeDelete,
    cleanupDryRun: handleCleanupDryRun,
    selectedIds,
  };

  const forensicsProps = {
    messages,
    threadActionsDisabled: showRuntimeBackendDegraded,
    selectedIds: reviewTargetIds,
    rows,
    busy,
    analyzeDelete: handleAnalyzeDelete,
    cleanupDryRun: handleCleanupDryRun,
    cleanupExecute: handleCleanupExecute,
    cleanupData,
    pendingCleanup,
    selectedImpactRows: reviewImpactRows,
    analysisRaw,
    cleanupRaw,
    analyzeDeleteError,
    cleanupDryRunError,
    cleanupExecuteError,
    analyzeDeleteErrorMessage,
    cleanupDryRunErrorMessage,
    cleanupExecuteErrorMessage,
  };

  return (
    <>
      <ThreadsCommandShell
        messages={messages}
        threadSearchInputRef={threadSearchInputRef as RefObject<HTMLInputElement>}
        query={query}
        setQuery={setQuery}
        filterMode={filterMode}
        setFilterMode={setFilterMode}
        filteredCount={filteredCount}
        highRiskVisibleCount={highRiskVisibleCount}
        pinnedCount={pinnedCount}
        selectedCount={selectedCount}
        dryRunReady={dryRunReady}
      />

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
          bulkArchive={handleBulkArchive}
          analyzeDelete={handleAnalyzeDelete}
          cleanupDryRun={handleCleanupDryRun}
          cleanupExecute={handleCleanupExecute}
          onRequestHardDeleteConfirm={requestHardDeleteConfirm}
          hardDeleteConfirmOpen={hardDeleteConfirmOpen}
          hardDeleteSkipConfirmChecked={hardDeleteSkipConfirmChecked}
          onToggleHardDeleteSkipConfirmChecked={setHardDeleteSkipConfirmChecked}
          onConfirmHardDelete={confirmHardDelete}
          onCancelHardDeleteConfirm={cancelHardDeleteConfirm}
          panelStyle={activePanelHeight ? { height: `${activePanelHeight}px` } : undefined}
        />
        <div className="thread-side-stack-anchor" ref={threadForensicsPanelRef}>
          <ThreadsSideStack
            showForensics={showForensics}
            threadSideStackRef={threadSideStackRef as RefObject<HTMLDivElement>}
            activePanelHeight={null}
            detailProps={detailProps}
            forensicsProps={forensicsProps}
          />
        </div>
      </section>
    </>
  );
}
