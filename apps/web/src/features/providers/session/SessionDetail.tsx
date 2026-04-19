import { formatBytes, formatDateTime, normalizeDisplayValue } from "@/shared/lib/format";
import { PanelHeader } from "@/shared/ui/components/PanelHeader";
import type { Messages } from "@/i18n";
import type { ProviderSessionActionResult, ProviderSessionRow, TranscriptPayload } from "@/shared/types";
import { SessionActionSection } from "@/features/providers/session/SessionActionSection";
import { SessionEmptyState } from "@/features/providers/session/SessionEmptyState";
import { SessionHero } from "@/features/providers/session/SessionHero";
import { SessionMetaCard } from "@/features/providers/session/SessionMetaCard";
import { SessionTranscriptPane } from "@/features/providers/session/SessionTranscriptPane";
import { useSessionDetailModel } from "@/features/providers/session/useSessionDetailModel";

export interface SessionDetailProps {
  messages: Messages;
  selectedSession: ProviderSessionRow | null;
  selectedCount?: number;
  sessionActionResult?: ProviderSessionActionResult | null;
  emptyScopeLabel?: string;
  emptyNextSessions?: Array<{
    title: string;
    path?: string;
    description?: string;
  }>;
  onOpenSessionPath?: (path: string) => void;
  sessionTranscriptData: TranscriptPayload | null;
  sessionTranscriptLoading: boolean;
  sessionTranscriptLimit: number;
  setSessionTranscriptLimit: React.Dispatch<React.SetStateAction<number>>;
  busy: boolean;
  canRunSessionAction: boolean;
  providerDeleteBackupEnabled: boolean;
  setProviderDeleteBackupEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  runSingleProviderAction: (
    provider: string,
    filePath: string,
    action: "backup_local" | "archive_local" | "delete_local",
    dryRun: boolean,
    options?: { backup_before_delete?: boolean },
  ) => void;
  runSingleProviderHardDelete: (provider: string, filePath: string) => Promise<ProviderSessionActionResult | null>;
}

export function SessionDetail(props: SessionDetailProps) {
  const {
    messages,
    emptyNextSessions = [],
    onOpenSessionPath,
    sessionTranscriptData,
    sessionTranscriptLoading,
    sessionTranscriptLimit,
    setSessionTranscriptLimit,
    busy,
    canRunSessionAction,
    providerDeleteBackupEnabled,
    setProviderDeleteBackupEnabled,
    runSingleProviderAction,
  } = props;
  const model = useSessionDetailModel(props);
  const activeSession = model.selectedSession;

  return (
    <section className={`panel session-detail-panel ${!activeSession ? "is-empty" : ""}`.trim()}>
      <PanelHeader title={messages.sessionDetail.title} subtitle={model.headerSubtitle} />
      <div ref={model.bodyRef} className="impact-body">
        {!activeSession ? (
          <SessionEmptyState
            messages={messages}
            emptyNextSessions={emptyNextSessions}
            emptyScopeLabel={model.resolvedEmptyScopeLabel}
            onOpenSessionPath={onOpenSessionPath}
          />
        ) : (
          <>
            <SessionHero
              sessionDisplayTitle={model.sessionDisplayTitle}
              sessionCompactMeta={model.sessionCompactMeta}
              provider={activeSession.provider}
              sourceLabel={model.sourceLabel}
              sessionFileName={model.sessionFileName}
            />
            <SessionActionSection
              messages={messages}
              selectedSession={activeSession}
              sessionActionSummary={model.sessionActionSummary}
              sessionActionCardClass={model.sessionActionCardClass}
              sessionActionCanExecute={model.sessionActionCanExecute}
              executeSessionActionLabel={model.executeSessionActionLabel}
              busy={busy}
              executeSessionAction={model.executeSessionAction}
              isElectronRuntime={model.isElectronRuntime}
              copyNotice={model.copyNotice}
              onCopyTitle={model.actions.copyTitle}
              onCopyId={model.actions.copyId}
              onCopyPath={model.actions.copyPath}
              onRevealInFinder={model.actions.revealInFinder}
              onOpenFile={model.actions.openFile}
              onPreviewFile={model.actions.previewFile}
              onOpenNewWindow={model.actions.openNewWindow}
              providerDeleteBackupEnabled={providerDeleteBackupEnabled}
              setProviderDeleteBackupEnabled={setProviderDeleteBackupEnabled}
              onRunArchiveDryRun={() =>
                runSingleProviderAction(
                  activeSession.provider,
                  activeSession.file_path,
                  "archive_local",
                  true,
                )
              }
              onRunDeleteDryRun={() =>
                runSingleProviderAction(
                  activeSession.provider,
                  activeSession.file_path,
                  "delete_local",
                  true,
                  { backup_before_delete: providerDeleteBackupEnabled },
                )
              }
              onRequestHardDeleteConfirm={model.openHardDeleteConfirm}
              onOpenFolder={model.actions.openFolder}
              canRunSessionAction={canRunSessionAction}
              hardDeleteConfirmOpen={model.hardDeleteConfirmOpen}
              hardDeleteSkipConfirmChecked={model.hardDeleteSkipConfirmChecked}
              onToggleHardDeleteSkipConfirmChecked={model.setHardDeleteSkipConfirmChecked}
              onCancelHardDeleteConfirm={model.resetHardDeleteConfirm}
              onConfirmHardDelete={model.confirmHardDelete}
            />
            <SessionMetaCard
              messages={messages}
              session={activeSession}
              title={model.sessionDisplayTitle}
              formatBytes={formatBytes}
              formatDateTime={formatDateTime}
              normalizeDisplayValue={normalizeDisplayValue}
            />
            <SessionTranscriptPane
              messages={messages}
              sessionTranscriptData={sessionTranscriptData}
              sessionTranscriptLoading={sessionTranscriptLoading}
              sessionTranscriptLimit={sessionTranscriptLimit}
              emptyTranscriptLabel={model.emptyTranscriptLabel}
              setSessionTranscriptLimit={setSessionTranscriptLimit}
            />
          </>
        )}
      </div>
    </section>
  );
}
