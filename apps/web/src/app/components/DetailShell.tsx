import { lazy, Suspense } from "react";
import { useAppContext } from "@/app/AppContext";
import { SurfaceSlotSkeleton } from "@/app/components/SurfaceSlotSkeleton";

const ThreadDetail = lazy(async () => {
  const mod = await import("@/features/threads/components/ThreadDetail");
  return { default: mod.ThreadDetail };
});

const SessionDetail = lazy(async () => {
  const mod = await import("@/features/providers/session/SessionDetail");
  return { default: mod.SessionDetail };
});

export function DetailShell() {
  const {
    messages,
    detailLayoutRef,
    showDetails,
    showThreadDetail,
    showSessionDetail,
    showProviders,
    showForensics,
    selectedThread,
    selectedThreadId,
    setSelectedThreadId,
    selectedIds,
    visibleRows,
    filteredRows,
    recentThreadTitle,
    searchThreadContext,
    threadDetailLoading,
    selectedThreadDetail,
    threadTranscriptData,
    threadTranscriptLoading,
    threadTranscriptLimit,
    setThreadTranscriptLimit,
    busy,
    showRuntimeBackendDegraded,
    bulkPin,
    bulkUnpin,
    bulkArchive,
    analyzeDelete,
    cleanupDryRun,
    selectedSession,
    setSelectedSessionPath,
    emptySessionScopeLabel,
    visibleProviderSessionSummary,
    emptySessionNextTitle,
    emptySessionNextPath,
    sessionTranscriptData,
    sessionTranscriptLoading,
    sessionTranscriptLimit,
    setSessionTranscriptLimit,
    canRunSelectedSessionAction,
    providerDeleteBackupEnabled,
    setProviderDeleteBackupEnabled,
    runSingleProviderAction,
    runSingleProviderHardDelete,
    rows,
  } = useAppContext();

  if (!showDetails || showForensics) return null;
  const shouldHideEmptySessionDetail =
    showSessionDetail &&
    !selectedSession &&
    (visibleProviderSessionSummary?.rows ?? 0) === 0;

  return (
    <section
      ref={detailLayoutRef}
      className={`detail-layout ${showThreadDetail && showSessionDetail ? "" : "single"}`.trim()}
    >
      {showThreadDetail && !showForensics ? (
        <Suspense
          fallback={<SurfaceSlotSkeleton />}
        >
          <ThreadDetail
            messages={messages}
            selectedThread={selectedThread}
            selectedThreadId={selectedThreadId}
            selectedIds={selectedIds}
            openThreadById={setSelectedThreadId}
            visibleThreadCount={visibleRows.length}
            filteredThreadCount={filteredRows.length}
            nextThreadId={visibleRows[0]?.thread_id || ""}
            nextThreadTitle={selectedThreadId
              ? recentThreadTitle(visibleRows[0] ?? { thread_id: selectedThreadId, title: "", risk_score: 0, is_pinned: false, source: "" })
              : recentThreadTitle(visibleRows[0] ?? { thread_id: "", title: "", risk_score: 0, is_pinned: false, source: "" })}
            nextThreadSource={visibleRows[0]?.source || "open from threads or recent review rows"}
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
          />
        </Suspense>
      ) : null}

      {showSessionDetail && !showProviders && !shouldHideEmptySessionDetail ? (
        <Suspense
          fallback={<SurfaceSlotSkeleton />}
        >
          <SessionDetail
            messages={messages}
            selectedSession={selectedSession}
            emptyScopeLabel={emptySessionScopeLabel}
            emptyNextSessions={
              emptySessionNextTitle
                ? [{ title: emptySessionNextTitle, path: emptySessionNextPath, description: "" }]
                : []
            }
            onOpenSessionPath={setSelectedSessionPath}
            sessionTranscriptData={sessionTranscriptData}
            sessionTranscriptLoading={sessionTranscriptLoading}
            sessionTranscriptLimit={sessionTranscriptLimit}
            setSessionTranscriptLimit={setSessionTranscriptLimit}
            busy={busy}
            canRunSessionAction={canRunSelectedSessionAction}
            providerDeleteBackupEnabled={providerDeleteBackupEnabled}
            setProviderDeleteBackupEnabled={setProviderDeleteBackupEnabled}
            runSingleProviderAction={runSingleProviderAction}
            runSingleProviderHardDelete={runSingleProviderHardDelete}
          />
        </Suspense>
      ) : null}
    </section>
  );
}
