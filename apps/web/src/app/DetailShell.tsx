import { lazy, Suspense } from "react";
import { PanelHeader } from "../design-system/PanelHeader";
import { useAppContext } from "./AppContext";

const ThreadDetail = lazy(async () => {
  const mod = await import("../features/threads/ThreadDetail");
  return { default: mod.ThreadDetail };
});

const SessionDetail = lazy(async () => {
  const mod = await import("../features/providers/SessionDetail");
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
    visibleRows,
    filteredRows,
    highRiskCount,
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
    emptySessionScopeLabel,
    visibleProviderSessionSummary,
    emptySessionNextTitle,
    sessionTranscriptData,
    sessionTranscriptLoading,
    sessionTranscriptLimit,
    setSessionTranscriptLimit,
    canRunSelectedSessionAction,
    providerDeleteBackupEnabled,
    setProviderDeleteBackupEnabled,
    runSingleProviderAction,
    rows,
  } = useAppContext();

  if (!showDetails || showForensics) return null;

  return (
    <section
      ref={detailLayoutRef}
      className={`detail-layout ${showThreadDetail && showSessionDetail ? "" : "single"}`.trim()}
    >
      {showThreadDetail && !showForensics ? (
        <Suspense
          fallback={
            <section className="panel">
              <PanelHeader title={messages.threadDetail.title} subtitle={messages.common.loading} />
              <div className="sub-toolbar">
                <div className="skeleton-line" />
              </div>
            </section>
          }
        >
          <ThreadDetail
            messages={messages}
            selectedThread={selectedThread}
            selectedThreadId={selectedThreadId}
            visibleThreadCount={visibleRows.length}
            filteredThreadCount={filteredRows.length}
            highRiskCount={highRiskCount}
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

      {showSessionDetail && !showProviders ? (
        <Suspense
          fallback={
            <section className="panel">
              <PanelHeader title={messages.sessionDetail.title} subtitle={messages.common.loading} />
              <div className="sub-toolbar">
                <div className="skeleton-line" />
              </div>
            </section>
          }
        >
          <SessionDetail
            messages={messages}
            selectedSession={selectedSession}
            emptyScopeLabel={emptySessionScopeLabel}
            emptyScopeRows={visibleProviderSessionSummary.rows}
            emptyScopeReady={visibleProviderSessionSummary.parse_ok}
            emptyNextSessionTitle={emptySessionNextTitle}
            sessionTranscriptData={sessionTranscriptData}
            sessionTranscriptLoading={sessionTranscriptLoading}
            sessionTranscriptLimit={sessionTranscriptLimit}
            setSessionTranscriptLimit={setSessionTranscriptLimit}
            busy={busy}
            canRunSessionAction={canRunSelectedSessionAction}
            providerDeleteBackupEnabled={providerDeleteBackupEnabled}
            setProviderDeleteBackupEnabled={setProviderDeleteBackupEnabled}
            runSingleProviderAction={runSingleProviderAction}
          />
        </Suspense>
      ) : null}
    </section>
  );
}
