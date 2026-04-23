import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import type { ProviderView } from "@/shared/types";
import type { ProviderSessionRow, ProviderSessionsEnvelope } from "@/shared/types";
import { useAppContext } from "@/app/AppContext";
import { apiGet } from "@/api";
import "@/features/overview/overview.css";
import { OverviewActivityRail } from "@/features/overview/components/OverviewActivityRail";
import { OverviewMainCanvas } from "@/features/overview/components/OverviewMainCanvas";
import { OverviewSetupStage } from "@/features/overview/components/OverviewSetupStage";
import {
  buildProviderBytesById,
  buildInterleavedSessionPreview,
  formatOverviewMessage,
  providerFromDataSource,
  readStoredSetupSelectionIds,
  resolveOverviewProvidersEntry,
} from "@/features/overview/model/overviewWorkbenchModel";
import { extractEnvelopeData, formatProviderDisplayName, parseNum } from "@/shared/lib/format";
import {
  readPersistedSetupState,
} from "@/shared/lib/appState";

export function OverviewWorkbench() {
  const {
    setupGuideOpen,
    setSetupGuideOpen,
    changeLayoutView,
    changeProviderView,
    openProvidersHome,
    setProviderView,
    handleProvidersIntent,
    runtimeLatencyText,
    focusSessionCommandId,
    focusSessionStatus,
    visibleProviderSessionSummary,
    syncStatusText,
    focusSessionTitle,
    focusSessionMeta,
    overviewBooting,
    visibleProviderSummary,
    searchRowsText,
    reviewRowsText,
    recentSessionPreview,
    focusSession,
    focusReviewTitle,
    focusReviewMeta,
    focusReviewThread,
    secondaryFlaggedPreview,
    activeSummaryText,
    activeProviderSummaryLine,
    parserScoreText,
    runtimeStatusText,
    backupSetsCount,
    messages,
    recentThreadGroups,
    recentThreadTitle,
    recentThreadSummary,
    visibleProviders,
    providers: allProviders,
    visibleDataSourceRows,
    dataSourceRows: allDataSourceRows,
    visibleProviderSessionRows,
    allProviderSessionRows: allProviderSessionRowsRaw,
    allProviderSessionProviders: allProviderSessionProvidersRaw,
    visibleParserReports,
    allParserReports: allProviderParserReportsRaw,
    providersRefreshing,
    providersLastRefreshAt,
    refreshProvidersData,
    providerView,
    visibleProviderIdSet,
    setSelectedSessionPath,
    setSelectedThreadId,
    setProviderProbeFilterIntent,
  } = useAppContext();
  const overviewMessages = messages.overview;

  const onToggleSetupGuide = () => setSetupGuideOpen(!setupGuideOpen);
  const onCloseSetupGuide = () => setSetupGuideOpen(false);
  const onOpenThreads = () => changeLayoutView("threads");
  const onOpenProviders = () => openProvidersHome();
  const onOpenProvidersWithProbeFilter = (probeFilter: "all" | "fail") => {
    handleProvidersIntent();
    setProviderProbeFilterIntent(probeFilter);
    setSelectedSessionPath("");
    changeProviderView(
      resolveOverviewProvidersEntry({
        selectedProviderIds: overviewSelectedProviderIds,
        primaryProviderId: overviewPrimaryProviderId,
        currentProviderView: providerView,
      }),
    );
    changeLayoutView("providers");
  };
  const onProvidersIntent = handleProvidersIntent;
  const onOpenRecentSession = (row: ProviderSessionRow) => {
    changeProviderView(visibleProviderIdSet.has(row.provider) ? (row.provider as ProviderView) : "all");
    setSelectedSessionPath(row.file_path);
    changeLayoutView("providers");
  };
  const onOpenRecentThread = (threadId: string) => {
    setSelectedThreadId(threadId);
    changeLayoutView("threads");
  };
  const totalVisibleSessionBytes = visibleProviderSessionRows.reduce(
    (sum, row) => sum + Number(row.size_bytes || 0),
    0,
  );
  const allProviderIdSet = new Set(allProviders.map((provider) => provider.provider));
  const persistedSetupState = readPersistedSetupState();
  const storedPreferredProviderId = persistedSetupState?.preferredProviderId ?? "";
  const storedSetupSelectionIds = persistedSetupState?.selectedProviderIds ?? (
    storedPreferredProviderId
      ? readStoredSetupSelectionIds(allProviderIdSet)
      : []
  );
  const overviewSelectedProviderIds = storedSetupSelectionIds.length
    ? storedSetupSelectionIds
    : providerView !== "all" && allProviderIdSet.has(providerView)
      ? [providerView]
      : [];
  const overviewSelectedProviderIdSet = new Set(overviewSelectedProviderIds);
  const overviewPrimaryProviderId =
    storedPreferredProviderId && overviewSelectedProviderIdSet.has(storedPreferredProviderId)
      ? storedPreferredProviderId
      : overviewSelectedProviderIds[0] ?? (providerView !== "all" ? providerView : "");
  const overviewProviderSessionQueries = useQueries({
    queries: overviewSelectedProviderIds.map((selectedProviderId) => ({
      queryKey: ["overview-provider-sessions", selectedProviderId],
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        apiGet<ProviderSessionsEnvelope>(
          `/api/provider-sessions?limit=60&provider=${encodeURIComponent(selectedProviderId)}`,
          { signal },
        ),
      enabled: overviewSelectedProviderIds.length > 1,
      staleTime: 30000,
      refetchOnWindowFocus: false,
      retry: 1,
    })),
  });
  const overviewQueriedSessionRows = useMemo(() => {
    if (overviewSelectedProviderIds.length <= 1) return [];
    return overviewProviderSessionQueries.flatMap((query) => {
      const data = extractEnvelopeData<NonNullable<ProviderSessionsEnvelope["data"]>>(query.data) ?? {};
      return data.rows ?? [];
    });
  }, [overviewProviderSessionQueries, overviewSelectedProviderIds.length]);
  const overviewSessionRows = useMemo(() => {
    const rows =
      overviewSelectedProviderIds.length > 1
        ? overviewQueriedSessionRows
        : overviewSelectedProviderIds.length
          ? allProviderSessionRowsRaw.filter((row) => overviewSelectedProviderIdSet.has(row.provider))
          : visibleProviderSessionRows;
    return [...rows].sort((left, right) => Date.parse(right.mtime || "") - Date.parse(left.mtime || ""));
  }, [
    allProviderSessionRowsRaw,
    overviewQueriedSessionRows,
    overviewSelectedProviderIdSet,
    overviewSelectedProviderIds.length,
    visibleProviderSessionRows,
  ]);
  const overviewPrimaryRows = useMemo(() => {
    if (!overviewPrimaryProviderId) return [];
    const sourceRows =
      overviewSelectedProviderIds.length > 1 && overviewQueriedSessionRows.length
        ? overviewQueriedSessionRows
        : allProviderSessionRowsRaw;
    return [...sourceRows]
      .filter((row) => row.provider === overviewPrimaryProviderId)
      .sort((left, right) => Date.parse(right.mtime || "") - Date.parse(left.mtime || ""));
  }, [
    allProviderSessionRowsRaw,
    overviewPrimaryProviderId,
    overviewQueriedSessionRows,
    overviewSelectedProviderIds.length,
  ]);
  const overviewFocusSession = overviewPrimaryRows[0] ?? overviewSessionRows[0] ?? focusSession;
  const overviewRecentSessionPreview = useMemo(
    () =>
      overviewSelectedProviderIds.length > 1
        ? buildInterleavedSessionPreview(overviewSessionRows, overviewPrimaryProviderId, 4)
        : overviewSessionRows.slice(0, 4),
    [overviewPrimaryProviderId, overviewSelectedProviderIds.length, overviewSessionRows],
  );
  const overviewSessionCount = useMemo(() => {
    if (!overviewSelectedProviderIds.length) return visibleProviderSessionSummary.rows;
    const total = allProviders.reduce((sum, provider) => {
      if (!overviewSelectedProviderIdSet.has(provider.provider)) return sum;
      return sum + Math.max(0, Number(provider.evidence?.session_log_count ?? 0));
    }, 0);
    return total || overviewSessionRows.length;
  }, [
    allProviders,
    overviewSelectedProviderIdSet,
    overviewSelectedProviderIds.length,
    overviewSessionRows.length,
    visibleProviderSessionSummary.rows,
  ]);
  const overviewBytesByProvider = useMemo(
    () =>
      buildProviderBytesById({
        dataSourceRows: allDataSourceRows,
        providerSessionProviders: allProviderSessionProvidersRaw,
        providerSessionRows: overviewSelectedProviderIds.length > 1 ? overviewQueriedSessionRows : allProviderSessionRowsRaw,
        providers: allProviders,
      }),
    [
      allDataSourceRows,
      allProviderSessionProvidersRaw,
      allProviderSessionRowsRaw,
      allProviders,
      overviewQueriedSessionRows,
      overviewSelectedProviderIds.length,
    ],
  );
  const overviewSessionBytes = useMemo(() => {
    if (!overviewSelectedProviderIds.length) return totalVisibleSessionBytes;
    const total = overviewSelectedProviderIds.reduce(
      (sum, providerId) => sum + (overviewBytesByProvider.get(providerId) ?? 0),
      0,
    );
    return total || overviewSessionRows.reduce((sum, row) => sum + Number(row.size_bytes || 0), 0);
  }, [
    overviewBytesByProvider,
    overviewSelectedProviderIds,
    overviewSelectedProviderIds.length,
    overviewSessionRows,
    totalVisibleSessionBytes,
  ]);
  const overviewParseOk = useMemo(() => {
    if (!overviewSelectedProviderIds.length) return visibleProviderSessionSummary.parse_ok;
    return allProviderParserReportsRaw.reduce((sum, report) => {
      if (!overviewSelectedProviderIdSet.has(report.provider)) return sum;
      return sum + parseNum(report.parse_ok);
    }, 0);
  }, [
    allProviderParserReportsRaw,
    overviewSelectedProviderIdSet,
    overviewSelectedProviderIds.length,
    visibleProviderSessionSummary.parse_ok,
  ]);
  const overviewParseFail = useMemo(() => {
    if (!overviewSelectedProviderIds.length) return visibleProviderSessionSummary.parse_fail;
    return allProviderParserReportsRaw.reduce((sum, report) => {
      if (!overviewSelectedProviderIdSet.has(report.provider)) return sum;
      return sum + parseNum(report.parse_fail);
    }, 0);
  }, [
    allProviderParserReportsRaw,
    overviewSelectedProviderIdSet,
    overviewSelectedProviderIds.length,
    visibleProviderSessionSummary.parse_fail,
  ]);
  const overviewParserScoreText = useMemo(() => {
    if (!overviewSelectedProviderIds.length) return parserScoreText;
    const scanned = overviewParseOk + overviewParseFail;
    if (scanned <= 0) return parserScoreText;
    return `${Number(((overviewParseOk / scanned) * 100).toFixed(1))}%`;
  }, [
    overviewParseFail,
    overviewParseOk,
    overviewSelectedProviderIds.length,
    parserScoreText,
  ]);
  const overviewActiveProviderCount = overviewSelectedProviderIds.length
    ? allProviders.filter(
        (provider) =>
          overviewSelectedProviderIdSet.has(provider.provider) && provider.status === "active",
      ).length
    : visibleProviderSummary.active;
  const overviewSelectedProviderLabels = overviewSelectedProviderIds
    .map((providerId) => formatProviderDisplayName(providerId))
    .filter(Boolean);
  const overviewActiveSummary = overviewSelectedProviderIds.length
    ? formatOverviewMessage(overviewMessages.activeSummary, {
        active: overviewActiveProviderCount,
        total: overviewSelectedProviderIds.length,
      })
    : activeSummaryText;
  const overviewActiveSummaryLine = overviewSelectedProviderIds.length
    ? overviewSelectedProviderLabels.join(" · ")
    : activeProviderSummaryLine;
  const showRecentSessionsRail = overviewSelectedProviderIds.length > 0;
  const getRecentThreadTitle = recentThreadTitle;
  const getRecentThreadSummary = recentThreadSummary;
  const setupStageContent = (
    <OverviewSetupStage
      providers={allProviders}
      dataSourceRows={allDataSourceRows}
      providerSessionProviders={allProviderSessionProvidersRaw}
      providerSessionRows={allProviderSessionRowsRaw}
      parserReports={allProviderParserReportsRaw}
      providersRefreshing={providersRefreshing}
      providersLastRefreshAt={providersLastRefreshAt}
      onRefresh={refreshProvidersData}
      onOpenProviders={(providerId) => {
        if (providerId && allProviderIdSet.has(providerId)) {
          changeProviderView(providerId as ProviderView);
        } else {
          changeProviderView("all");
        }
        changeLayoutView("providers");
      }}
      onOpenSearch={() => changeLayoutView("search")}
      onClose={onCloseSetupGuide}
      onApplyPreferredSelection={(selection) => {
        setProviderView(
          allProviderIdSet.has(selection.providerView)
            ? (selection.providerView as ProviderView)
            : "all",
        );
      }}
    />
  );

  return (
    <section className="overview-workbench">
      {!setupGuideOpen ? (
        <div className="overview-workbench-grid">
          <OverviewMainCanvas
            messages={messages}
            overviewMessages={overviewMessages}
            setupGuideOpen={setupGuideOpen}
            overviewBooting={overviewBooting}
            runtimeLatencyText={runtimeLatencyText}
            runtimeStatusText={runtimeStatusText}
            syncStatusText={syncStatusText}
            backupSetsCount={backupSetsCount}
            reviewRowsText={reviewRowsText}
            searchRowsText={searchRowsText}
            parserScoreText={overviewSelectedProviderIds.length ? overviewParserScoreText : parserScoreText}
            focusSessionTitle={focusSessionTitle}
            focusSessionMeta={focusSessionMeta}
            overviewFocusSession={overviewFocusSession}
            focusSessionCommandId={focusSessionCommandId}
            focusSessionStatus={focusSessionStatus}
            overviewSelectedProviderIds={overviewSelectedProviderIds}
            overviewParseOk={overviewParseOk}
            overviewParseFail={overviewParseFail}
            visibleProviderSessionSummary={visibleProviderSessionSummary}
            overviewSessionCount={overviewSessionCount}
            overviewActiveProviderCount={overviewActiveProviderCount}
            overviewSessionBytes={overviewSessionBytes}
            totalVisibleSessionBytes={totalVisibleSessionBytes}
            overviewRecentSessionPreview={overviewRecentSessionPreview}
            focusReviewThread={focusReviewThread}
            focusReviewTitle={focusReviewTitle}
            focusReviewMeta={focusReviewMeta}
            secondaryFlaggedPreview={secondaryFlaggedPreview}
            recentThreadTitle={recentThreadTitle}
            overviewActiveSummary={overviewActiveSummary}
            overviewActiveSummaryLine={overviewActiveSummaryLine}
            onToggleSetupGuide={onToggleSetupGuide}
            onOpenThreads={onOpenThreads}
            onOpenProviders={onOpenProviders}
            onProvidersIntent={onProvidersIntent}
            onOpenProvidersWithProbeFilter={onOpenProvidersWithProbeFilter}
            onOpenRecentSession={onOpenRecentSession}
            onOpenRecentThread={onOpenRecentThread}
          />

          <OverviewActivityRail
            messages={messages}
            overviewMessages={overviewMessages}
            showRecentSessionsRail={showRecentSessionsRail}
            overviewRecentSessionPreview={overviewRecentSessionPreview}
            recentThreadGroups={recentThreadGroups}
            getRecentThreadTitle={getRecentThreadTitle}
            getRecentThreadSummary={getRecentThreadSummary}
            overviewBooting={overviewBooting}
            syncStatusText={syncStatusText}
            onOpenRecentSession={onOpenRecentSession}
            onOpenRecentThread={onOpenRecentThread}
          />
        </div>
      ) : (
        <section
          className="overview-secondary-panel overview-setup-stage"
          aria-label={messages.overview.setupStageAriaLabel}
        >
          <div className="overview-secondary-body">{setupStageContent}</div>
        </section>
      )}
    </section>
  );
}
