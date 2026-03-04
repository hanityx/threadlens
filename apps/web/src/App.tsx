import { useAppData } from "./hooks/useAppData";
import { KpiCard } from "./components/KpiCard";
import { RoutingPanel } from "./components/RoutingPanel";
import { ProvidersPanel } from "./components/ProvidersPanel";
import { ThreadsTable } from "./components/ThreadsTable";
import { ForensicsPanel } from "./components/ForensicsPanel";
import { ThreadDetail } from "./components/ThreadDetail";
import { SessionDetail } from "./components/SessionDetail";
import { getMessages } from "./i18n";

export function App() {
  const {
    theme,
    setTheme,
    locale,
    setLocale,
    layoutView,
    setLayoutView,
    query,
    setQuery,
    filterMode,
    setFilterMode,
    providerView,
    setProviderView,
    providerDataDepth,
    setProviderDataDepth,
    selected,
    setSelected,
    selectedProviderFiles,
    setSelectedProviderFiles,
    selectedThreadId,
    setSelectedThreadId,
    selectedSessionPath,
    setSelectedSessionPath,

    runtime,
    threads,
    recovery,
    providerMatrix,
    providerSessions,
    providerParserHealth,

    bulkPin,
    bulkUnpin,
    bulkArchive,
    analyzeDelete,
    cleanupDryRun,
    analyzeDeleteError,
    cleanupDryRunError,
    providerSessionActionError,

    rows,
    filteredRows,
    visibleRows,
    selectedIds,
    allFilteredSelected,
    pinnedCount,
    highRiskCount,

    analysisRaw,
    cleanupRaw,
    cleanupData,
    selectedImpactRows,

    providers,
    providerSummary,
    providerTabs,
    providerSessionRows,
    providerSessionSummary,
    providerSessionsLimit,
    providerRowsSampled,
    allProviderRowsSelected,
    selectedProviderLabel,
    selectedProviderFilePaths,
    canRunProviderAction,
    canRunSelectedSessionAction,
    providerActionData,
    parserReports,
    parserSummary,
    readOnlyProviders,
    cleanupReadyProviders,

    selectedThread,
    threadDetailLoading,
    selectedThreadDetail,
    threadTranscriptData,
    threadTranscriptLoading,
    threadTranscriptLimit,
    setThreadTranscriptLimit,
    selectedSession,
    sessionTranscriptData,
    sessionTranscriptLoading,
    sessionTranscriptLimit,
    setSessionTranscriptLimit,

    executionGraphData,

    runtimeLoading,
    recoveryLoading,
    threadsLoading,
    providerMatrixLoading,
    providerSessionsLoading,
    parserLoading,
    executionGraphLoading,

    busy,
    showProviders,
    showThreadsTable,
    showForensics,
    showRouting,
    showDetails,

    toggleSelectAllFiltered,
    toggleSelectAllProviderRows,
    runProviderAction,
    runSingleProviderAction,
  } = useAppData();

  const messages = getMessages(locale);

  return (
    <main className="page">
      <section className="top-actions">
        <div className="layout-nav">
          <button
            type="button"
            className={`view-btn ${layoutView === "overview" ? "is-active" : ""}`}
            onClick={() => setLayoutView("overview")}
          >
            {messages.nav.overview}
          </button>
          <button
            type="button"
            className={`view-btn ${layoutView === "threads" ? "is-active" : ""}`}
            onClick={() => setLayoutView("threads")}
          >
            {messages.nav.threads}
          </button>
          <button
            type="button"
            className={`view-btn ${layoutView === "providers" ? "is-active" : ""}`}
            onClick={() => setLayoutView("providers")}
          >
            {messages.nav.providers}
          </button>
          <button
            type="button"
            className={`view-btn ${layoutView === "forensics" ? "is-active" : ""}`}
            onClick={() => setLayoutView("forensics")}
          >
            {messages.nav.forensics}
          </button>
          <button
            type="button"
            className={`view-btn ${layoutView === "routing" ? "is-active" : ""}`}
            onClick={() => setLayoutView("routing")}
          >
            {messages.nav.routing}
          </button>
        </div>
        <div className="top-controls">
          <label className="provider-quick-switch">
            <span>{messages.nav.providerScope}</span>
            <select
              className="provider-quick-select"
              value={providerView}
              onChange={(e) => setProviderView(e.target.value)}
            >
              {providerTabs.map((tab) => (
                <option key={`provider-scope-${tab.id}`} value={tab.id}>
                  {tab.id === "all" ? messages.common.allAi : tab.name} ({tab.scanned})
                </option>
              ))}
            </select>
          </label>
          <div className="lang-switch" role="group" aria-label={messages.nav.language}>
            <button
              type="button"
              className={`lang-btn ${locale === "ko" ? "is-active" : ""}`}
              onClick={() => setLocale("ko")}
            >
              {messages.nav.languageKo}
            </button>
            <button
              type="button"
              className={`lang-btn ${locale === "en" ? "is-active" : ""}`}
              onClick={() => setLocale("en")}
            >
              {messages.nav.languageEn}
            </button>
          </div>
          <button
            type="button"
            className="btn-outline"
            onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
            title={theme === "dark" ? messages.nav.switchToLight : messages.nav.switchToDark}
          >
            {theme === "dark" ? messages.nav.light : messages.nav.dark}
          </button>
        </div>
      </section>

      <section className="hero">
        <div className="hero-top">
          <h1>{messages.hero.title}</h1>
          <span className="hero-badge">{messages.hero.badge}</span>
        </div>
        <p>{messages.hero.description}</p>
        <div className="hero-meta">
          <span className="meta-chip">
            {messages.hero.active} {providerSummary?.active ?? 0}/{providerSummary?.total ?? providers.length}
          </span>
          <span className="meta-chip">
            {messages.hero.safeCleanup} {cleanupReadyProviders.join(", ") || "-"}
          </span>
          <span className="meta-chip">
            {messages.hero.readOnly} {readOnlyProviders.join(", ") || "-"}
          </span>
          <span className="meta-chip">
            {messages.hero.threads} {rows.length}
          </span>
          <span className="meta-chip">
            {messages.hero.highRisk} {highRiskCount}
          </span>
        </div>
      </section>

      <section className="kpi-grid">
        <KpiCard
          label={messages.kpi.pythonBackend}
          value={runtimeLoading ? "..." : runtime.data?.data?.python_backend.reachable ? messages.kpi.reachable : messages.kpi.down}
          hint={runtime.data?.data?.python_backend.url}
        />
        <KpiCard
          label={messages.kpi.latency}
          value={runtimeLoading ? "..." : runtime.data?.data?.python_backend.latency_ms ?? "-"}
          hint="ms"
        />
        <KpiCard label={messages.kpi.pinned} value={threadsLoading ? "..." : pinnedCount} hint={`/${rows.length}`} />
        <KpiCard
          label={messages.kpi.highRisk}
          value={threadsLoading ? "..." : highRiskCount}
          hint={messages.kpi.highRiskHint}
        />
        <KpiCard
          label={messages.kpi.recovery}
          value={
            recoveryLoading
              ? "..."
              : `${recovery.data?.summary?.checklist_done ?? 0}/${recovery.data?.summary?.checklist_total ?? 0}`
          }
          hint={`${messages.kpi.backupSets} ${recovery.data?.summary?.backup_sets ?? 0}`}
        />
      </section>

      {showProviders ? (
        <ProvidersPanel
          messages={messages}
          providers={providers}
          providerSummary={providerSummary}
          providerMatrixLoading={providerMatrixLoading}
          providerTabs={providerTabs}
          providerView={providerView}
          setProviderView={setProviderView}
          providerDataDepth={providerDataDepth}
          setProviderDataDepth={setProviderDataDepth}
          providerSessionRows={providerSessionRows}
          providerSessionSummary={providerSessionSummary}
          providerSessionsLimit={providerSessionsLimit}
          providerRowsSampled={providerRowsSampled}
          providerSessionsLoading={providerSessionsLoading}
          selectedProviderFiles={selectedProviderFiles}
          setSelectedProviderFiles={setSelectedProviderFiles}
          allProviderRowsSelected={allProviderRowsSelected}
          toggleSelectAllProviderRows={toggleSelectAllProviderRows}
          selectedProviderLabel={selectedProviderLabel}
          selectedProviderFilePaths={selectedProviderFilePaths}
          canRunProviderAction={canRunProviderAction}
          busy={busy}
          runProviderAction={runProviderAction}
          providerActionData={providerActionData}
          parserReports={parserReports}
          parserLoading={parserLoading}
          parserSummary={parserSummary}
          selectedSessionPath={selectedSessionPath}
          setSelectedSessionPath={setSelectedSessionPath}
        />
      ) : null}

      {showRouting ? <RoutingPanel messages={messages} data={executionGraphData} loading={executionGraphLoading} /> : null}

      {showThreadsTable ? (
        <section className="toolbar">
          <input
            placeholder={messages.toolbar.searchThreads}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="search-input"
          />
          <select
            className="filter-select"
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as "all" | "high-risk" | "pinned")}
          >
            <option value="all">{messages.toolbar.all}</option>
            <option value="high-risk">{messages.toolbar.highRisk}</option>
            <option value="pinned">{messages.toolbar.pinned}</option>
          </select>
          <span className="sub-hint">{messages.toolbar.detailHint}</span>
        </section>
      ) : null}

      {showThreadsTable || showForensics ? (
        <section className={`ops-layout ${showForensics ? "" : "single"}`.trim()}>
          {showThreadsTable ? (
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
              busy={busy}
              bulkPin={bulkPin}
              bulkUnpin={bulkUnpin}
              bulkArchive={bulkArchive}
              analyzeDelete={analyzeDelete}
              cleanupDryRun={cleanupDryRun}
            />
          ) : null}

          {showForensics ? (
            <ForensicsPanel
              messages={messages}
              selectedIds={selectedIds}
              rows={rows}
              cleanupData={cleanupData}
              selectedImpactRows={selectedImpactRows}
              analysisRaw={analysisRaw}
              cleanupRaw={cleanupRaw}
              analyzeDeleteError={analyzeDeleteError}
              cleanupDryRunError={cleanupDryRunError}
            />
          ) : null}
        </section>
      ) : null}

      {showDetails ? (
        <section className="detail-layout">
          <ThreadDetail
            messages={messages}
            selectedThread={selectedThread}
            selectedThreadId={selectedThreadId}
            threadDetailLoading={threadDetailLoading}
            selectedThreadDetail={selectedThreadDetail}
            threadTranscriptData={threadTranscriptData}
            threadTranscriptLoading={threadTranscriptLoading}
            threadTranscriptLimit={threadTranscriptLimit}
            setThreadTranscriptLimit={setThreadTranscriptLimit}
            busy={busy}
            bulkPin={bulkPin}
            bulkUnpin={bulkUnpin}
            bulkArchive={bulkArchive}
            analyzeDelete={analyzeDelete}
            cleanupDryRun={cleanupDryRun}
          />

          <SessionDetail
            messages={messages}
            selectedSession={selectedSession}
            sessionTranscriptData={sessionTranscriptData}
            sessionTranscriptLoading={sessionTranscriptLoading}
            sessionTranscriptLimit={sessionTranscriptLimit}
            setSessionTranscriptLimit={setSessionTranscriptLimit}
            busy={busy}
            canRunSessionAction={canRunSelectedSessionAction}
            runSingleProviderAction={runSingleProviderAction}
          />
        </section>
      ) : null}

      {runtime.isError ? <div className="error-box">{messages.errors.runtime}</div> : null}
      {recovery.isError ? <div className="error-box">{messages.errors.recovery}</div> : null}
      {providerMatrix.isError ? <div className="error-box">{messages.errors.providerMatrix}</div> : null}
      {providerSessions.isError ? <div className="error-box">{messages.errors.providerSessions}</div> : null}
      {providerParserHealth.isError ? <div className="error-box">{messages.errors.parserHealth}</div> : null}
      {providerSessionActionError ? <div className="error-box">{messages.errors.providerAction}</div> : null}
      {busy ? <div className="busy-indicator">{messages.busy}</div> : null}
    </main>
  );
}
