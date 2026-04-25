import type { ExecutionGraphData } from "@threadlens/shared-contracts";
import type { ProvidersPanelProps } from "@/features/providers/components/ProvidersPanel";
import type { SessionDetailProps } from "@/features/providers/session/SessionDetail";
import { shouldShowProvidersWorkspaceSessionDetail } from "@/features/providers/model/providersWorkspaceModel";

type ProvidersPanelRelayProps = Omit<ProvidersPanelProps, "sessionDetailSlot" | "diagnosticsSlot">;

type RoutingPanelRelayProps = {
  messages: ProvidersPanelProps["messages"];
  data: ExecutionGraphData | null | undefined;
  loading: boolean;
  providerView: ProvidersPanelProps["providerView"];
  onSelectProviderView?: (view: ProvidersPanelProps["providerView"]) => void;
  providerSessionRows: ProvidersPanelProps["providerSessionRows"];
  parserReports: ProvidersPanelProps["parserReports"];
  visibleProviderIds?: string[];
};

export interface ProvidersWorkspacePropsInput extends ProvidersPanelRelayProps {
  selectedSession: SessionDetailProps["selectedSession"];
  selectedSessionCount: number;
  selectedSessionActionResult: SessionDetailProps["sessionActionResult"];
  emptySessionScopeLabel: string;
  emptyNextSessions: NonNullable<SessionDetailProps["emptyNextSessions"]>;
  sessionTranscriptData: SessionDetailProps["sessionTranscriptData"];
  sessionTranscriptLoading: SessionDetailProps["sessionTranscriptLoading"];
  sessionTranscriptLimit: SessionDetailProps["sessionTranscriptLimit"];
  setSessionTranscriptLimit: SessionDetailProps["setSessionTranscriptLimit"];
  canRunSelectedSessionAction: SessionDetailProps["canRunSessionAction"];
  runSingleProviderAction: SessionDetailProps["runSingleProviderAction"];
  runSingleProviderHardDelete: SessionDetailProps["runSingleProviderHardDelete"];
  executionGraphData: ExecutionGraphData | null | undefined;
  executionGraphLoading: boolean;
  visibleProviderIds?: string[];
  sessionDetailKey: string;
}

export function buildProvidersWorkspaceProps(input: ProvidersWorkspacePropsInput): {
  panelProps: ProvidersPanelRelayProps;
  sessionDetailProps: SessionDetailProps;
  routingPanelProps: RoutingPanelRelayProps;
  showSessionDetailSlot: boolean;
  sessionDetailKey: string;
} {
  const {
    selectedSession,
    selectedSessionCount,
    selectedSessionActionResult,
    emptySessionScopeLabel,
    emptyNextSessions,
    sessionTranscriptData,
    sessionTranscriptLoading,
    sessionTranscriptLimit,
    setSessionTranscriptLimit,
    canRunSelectedSessionAction,
    runSingleProviderAction,
    runPreparedProviderAction,
    runSingleProviderHardDelete,
    executionGraphData,
    executionGraphLoading,
    visibleProviderIds,
    sessionDetailKey,
    ...panelProps
  } = input;

  return {
    panelProps,
    sessionDetailProps: {
      messages: input.messages,
      selectedSession,
      selectedCount: selectedSessionCount,
      sessionActionResult: selectedSessionActionResult,
      emptyScopeLabel: emptySessionScopeLabel,
      emptyNextSessions,
      onOpenSessionPath: input.setSelectedSessionPath,
      sessionTranscriptData,
      sessionTranscriptLoading,
      sessionTranscriptLimit,
      setSessionTranscriptLimit,
      busy: input.busy,
      canRunSessionAction: canRunSelectedSessionAction,
      providerDeleteBackupEnabled: input.providerDeleteBackupEnabled,
      runSingleProviderAction,
      sessionActionSelection: input.providerActionSelection,
      canRunPreparedSessionAction: input.canRunProviderAction,
      runPreparedProviderAction,
      runSingleProviderHardDelete,
    },
    routingPanelProps: {
      messages: input.messages,
      data: executionGraphData,
      loading: executionGraphLoading,
      providerView: input.providerView,
      onSelectProviderView: input.setProviderView,
      providerSessionRows: input.providerSessionRows,
      parserReports: input.parserReports,
      visibleProviderIds,
    },
    showSessionDetailSlot: shouldShowProvidersWorkspaceSessionDetail({
      selectedSession,
      visibleSessionRowsCount: input.providerSessionRows.length,
    }),
    sessionDetailKey,
  };
}
