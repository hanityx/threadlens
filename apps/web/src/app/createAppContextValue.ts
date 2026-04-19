import type { AppContextValue, AppLocalState } from "./AppContext";
import type { useAppData } from "../hooks/useAppData";
import type { useAppShellModel } from "./appShellModel";
import type { useAppShellBehavior } from "./appShellBehavior";

type AppShellDerivedState = Pick<
  ReturnType<typeof useAppShellModel>,
  | "visibleProviderTabs"
  | "visibleProviderIds"
  | "visibleProviderIdSet"
  | "visibleProviders"
  | "visibleProviderSummary"
  | "visibleSlowProviderIds"
  | "visibleProviderSessionRows"
  | "allVisibleProviderSessionRows"
  | "visibleProviderSessionSummary"
  | "overviewBooting"
  | "activeSummaryText"
  | "searchRowsText"
  | "reviewRowsText"
  | "syncStatusText"
  | "recentSessionPreview"
  | "focusSession"
  | "focusSessionTitle"
  | "focusSessionMeta"
  | "focusSessionCommandId"
  | "focusSessionStatus"
  | "emptySessionNextTitle"
  | "emptySessionNextPath"
  | "visibleParserReports"
  | "allVisibleParserReports"
  | "visibleParserSummary"
  | "focusReviewThread"
  | "focusReviewTitle"
  | "focusReviewMeta"
  | "secondaryFlaggedPreview"
  | "recentThreadGroups"
  | "recentThreadTitle"
  | "recentThreadSummary"
  | "activeProviderSummaryLine"
  | "visibleDataSourceRows"
  | "visibleAllProviderRowsSelected"
  | "searchProviderOptions"
  | "showSearch"
  | "showProviders"
  | "showThreadsTable"
  | "showForensics"
  | "showRouting"
  | "showThreadDetail"
  | "showSessionDetail"
  | "showDetails"
  | "showGlobalAnalyzeDeleteError"
  | "showGlobalCleanupDryRunError"
  | "hasGlobalErrorStack"
  | "parserScoreText"
  | "runtimeLatencyText"
  | "backupSetsCount"
>;

type AppShellBehaviorState = Pick<
  ReturnType<typeof useAppShellBehavior>,
  | "handleProvidersIntent"
  | "handleSearchIntent"
  | "handleDiagnosticsIntent"
  | "handleHeaderSearchSubmit"
>;

type CreateAppContextValueArgs = {
  appData: ReturnType<typeof useAppData>;
  shellModel: AppShellDerivedState;
  shellBehavior: AppShellBehaviorState;
  localState: AppLocalState;
};

export function createAppContextValue({
  appData,
  shellModel,
  shellBehavior,
  localState,
}: CreateAppContextValueArgs): AppContextValue {
  return {
    ...appData,
    ...shellModel,
    ...shellBehavior,
    ...localState,
  };
}
