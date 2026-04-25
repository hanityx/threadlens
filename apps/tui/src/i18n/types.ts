export const SUPPORTED_LOCALES = [
  "en",
  "ko",
  "zh-CN",
  "hi",
  "es",
  "pt-BR",
  "ru",
  "id",
  "de",
  "ja",
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export type TuiMessages = {
  app: {
    helpTitle: string;
    helpGlobalLabel: string;
    helpGlobalBody: string;
    helpSearchLabel: string;
    helpSearchBodyLine1: string;
    helpSearchBodyLine2: string;
    helpSearchBodyLine3: string;
    helpSessionsLabel: string;
    helpSessionsBodyLine1: string;
    helpSessionsBodyLine2: string;
    helpSessionsBodyLine3: string;
    helpCleanupLabel: string;
    helpCleanupBodyLine1: string;
    helpCleanupBodyLine2: string;
    footerShortcuts: Record<"search" | "sessions" | "cleanup", string[]>;
    updateReleaseShortcut: string;
    updateDismissShortcut: string;
  };
  cli: {
    helpTitle: string;
    usageLabel: string;
    examplesLabel: string;
    ttyRequired: string;
    invalidView: string;
  };
  common: {
    loading: string;
    detail: string;
    results: string;
    filterLabel: string;
    filterEditingPlaceholder: string;
    filterIdlePlaceholder: string;
    switchHint: string;
    sessionsUnit: string;
    threadsUnit: string;
    hitsUnit: string;
    noResultsForFilter: string;
    updateAvailable: (latest: string, current: string) => string;
    updateSummaryFallback: string;
  };
  search: {
    searching: string;
    queryEditingPlaceholder: string;
    queryIdlePlaceholder: string;
    enterAtLeastTwoCharacters: string;
    noResultsFound: string;
    scopeLabel: string;
    sessionsSummary: (sessions: number, available: number, truncated: boolean) => string;
    groupedSummary: (sessions: number, hits: number) => string;
    hitCount: (count: number) => string;
    snippetPager: (current: number, total: number) => string;
    snippetLabel: string;
    noSnippet: string;
    enterOpen: string;
    ctrlOpenCleanup: string;
    selectResult: string;
    cleanupAction: string;
  };
  sessions: {
    loading: string;
    scopeLabel: string;
    pendingLabel: string;
    clearHint: string;
    parseFailLabel: string;
    noSessionsFound: string;
    noResultsForFilter: string;
    transcript: string;
    messagesCount: (count: number) => string;
    noMessages: string;
    selectSession: string;
    backupDone: (applied: number, valid: number) => string;
    backupRunning: string;
    archiveDryRun: string;
    archiveDryRunDone: (target: number) => string;
    deleteDryRun: string;
    deleteDryRunDone: (target: number) => string;
    pendingTokenCleared: string;
    archiveExecutePrompt: (token: string) => string;
    deleteExecutePrompt: (token: string) => string;
    archiveRunDryRunFirst: string;
    deleteRunDryRunFirst: string;
    archiving: string;
    deleting: string;
    archiveDone: (applied: number, valid: number) => string;
    deleteDone: (applied: number, valid: number, backupCount: number) => string;
    summary: (rows: number) => string;
    summaryWithFailures: (rows: number, parseFail: number) => string;
    actionBackup: string;
    actionArchiveDryRun: string;
    actionArchiveExecute: string;
    actionDeleteDryRun: string;
    actionDeleteExecute: string;
  };
  cleanup: {
    loading: string;
    pendingDeleteLabel: string;
    clearHint: string;
    selectionCleared: string;
    pendingTokenCleared: string;
    analyzingImpact: string;
    impactDone: (count: number, summary: string | null) => string;
    dryRunRunning: string;
    dryRunDone: (files: number) => string;
    executePrompt: (token: string) => string;
    executeRunDryRunFirst: string;
    executingCleanup: string;
    cleanupDone: (deleted: number, files: number, backupCount: number) => string;
    noThreadsFound: string;
    noResultsForFilter: string;
    selectedCount: (count: number) => string;
    riskLabel: (score: number) => string;
    pinned: string;
    tagsLabel: (tags: string[]) => string;
    impactAnalysis: string;
    itemsCount: (count: number) => string;
    deletedCount: (count: number) => string;
    backupCount: (count: number) => string;
    selectThread: string;
    actionSelect: string;
    actionAnalysis: string;
    actionDryRun: string;
    actionExecute: string;
    actionClear: string;
  };
};
