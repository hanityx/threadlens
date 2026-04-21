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

export function resolveThreadWorkbenchPanelHeight({
  tableHeight,
  stackHeight,
  stackScrollHeight,
  hasSelectedThread,
  availableViewportHeight,
}: {
  tableHeight: number;
  stackHeight: number;
  stackScrollHeight: number;
  hasSelectedThread: boolean;
  availableViewportHeight?: number;
}) {
  if (hasSelectedThread) {
    const viewportClamp =
      typeof availableViewportHeight === "number" && availableViewportHeight > 0
        ? Math.floor(availableViewportHeight)
        : tableHeight;
    return viewportClamp;
  }
  return Math.max(tableHeight, stackHeight, stackScrollHeight);
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
    if (!showForensics || !threadSideStackRef.current) {
      setActivePanelHeight(null);
      return;
    }

    const target = threadSideStackRef.current;
    const tableTarget = document.querySelector<HTMLElement>(".threads-table-panel");
    let frameId = 0;

    const syncHeight = () => {
      const tableRect = tableTarget?.getBoundingClientRect();
      const tableHeight = Math.ceil(tableRect?.height ?? 0);
      const stackHeight = Math.ceil(target.getBoundingClientRect().height);
      const stackScrollHeight = Math.ceil(target.scrollHeight);
      const availableViewportHeight =
        typeof window !== "undefined" && tableRect ? window.innerHeight - tableRect.top : undefined;
      const nextHeight = resolveThreadWorkbenchPanelHeight({
        tableHeight,
        stackHeight,
        stackScrollHeight,
        hasSelectedThread: Boolean(selectedThreadId),
        availableViewportHeight,
      });
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
    if (tableTarget) observer.observe(tableTarget);
    Array.from(target.children).forEach((child) => {
      if (child instanceof HTMLElement) observer.observe(child);
    });

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
            activePanelHeight={selectedThreadId ? null : activePanelHeight}
            detailProps={detailProps}
            forensicsProps={forensicsProps}
          />
        </div>
      </section>
    </>
  );
}
