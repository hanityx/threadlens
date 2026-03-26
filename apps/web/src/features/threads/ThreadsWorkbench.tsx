import { useAppContext } from "../../app/AppContext";
import { PanelHeader } from "../../design-system/PanelHeader";
import { ThreadsTable } from "./ThreadsTable";
import { ThreadDetailSlot } from "./ThreadDetailSlot";

export function ThreadsWorkbench() {
  const {
    messages,
    threadSearchInputRef,
    query,
    setQuery,
    filterMode,
    setFilterMode,
    threadsFetchMs,
    threadsFastBooting,
    visibleRows,
    filteredRows,
    selectedIds,
    cleanupData,
    selectedImpactRows,
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

  const visibleCount = visibleRows.length;
  const filteredCount = filteredRows.length;
  const selectedCount = selectedIds.length;
  const dryRunReady = Boolean(cleanupData?.confirm_token_expected);
  const selectedImpactCount = selectedImpactRows.length;

  return (
    <>
      <section className="panel cleanup-command-shell">
        <PanelHeader title="Review" subtitle="analyze · clean up" />
        <div className="cleanup-command-body">
          <div className="thread-workflow-copy">
            <span className="overview-note-label">cleanup</span>
            <strong>Review &amp; archive</strong>
            <p>Select, analyze, clean up.</p>
          </div>
          <div className="thread-status-grid">
            <article className="thread-status-card">
              <span>visible</span>
              <strong>{visibleCount}/{filteredCount}</strong>
              <p>rows</p>
            </article>
            <article className={`thread-status-card ${selectedCount > 0 ? "is-accent" : ""}`.trim()}>
              <span>selected</span>
              <strong>{selectedCount}</strong>
              <p>selected</p>
            </article>
            <article className={`thread-status-card ${dryRunReady ? "is-ready" : ""}`.trim()}>
              <span>dry-run</span>
              <strong>{dryRunReady ? "ready" : "pending"}</strong>
              <p>{selectedImpactCount > 0 ? `${selectedImpactCount} impact` : "impact first"}</p>
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
            <span className="sub-hint">
              fetch {threadsFetchMs !== null ? `${threadsFetchMs}ms` : "-"}
            </span>
            {threadsFastBooting ? (
              <span className="sub-hint">fast boot</span>
            ) : null}
            <span className="sub-hint">selected</span>
          </section>
        </div>
      </section>

      <section className={`${showForensics ? "ops-layout" : "ops-layout single"}`.trim()}>
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
          selectedImpactCount={selectedImpactRows.length}
          cleanupData={cleanupData}
          busy={busy}
          threadActionsDisabled={showRuntimeBackendDegraded}
          bulkPin={bulkPin}
          bulkUnpin={bulkUnpin}
          bulkArchive={bulkArchive}
          analyzeDelete={analyzeDelete}
          cleanupDryRun={cleanupDryRun}
        />
        {showForensics ? (
          <ThreadDetailSlot
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
        ) : null}
      </section>
    </>
  );
}
