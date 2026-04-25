import type { Dispatch, SetStateAction } from "react";
import { formatBytes, formatDateTime, normalizeDisplayValue } from "@/shared/lib/format";
import { PanelHeader } from "@/shared/ui/components/PanelHeader";
import { Button } from "@/shared/ui/components/Button";
import type { Messages } from "@/i18n";
import type { ProviderActionSelection, ProviderSessionActionResult, ProviderSessionRow, TranscriptPayload } from "@/shared/types";
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
  sessionActionSelection?: ProviderActionSelection | null;
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
  setSessionTranscriptLimit: Dispatch<SetStateAction<number>>;
  busy: boolean;
  canRunSessionAction: boolean;
  providerDeleteBackupEnabled: boolean;
  runSingleProviderAction: (
    provider: string,
    filePath: string,
    action: ProviderSessionActionResult["action"],
    dryRun: boolean,
    options?: { backup_before_delete?: boolean },
  ) => void;
  canRunPreparedSessionAction?: boolean;
  runPreparedProviderAction?: (selection: ProviderActionSelection) => Promise<ProviderSessionActionResult | null>;
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
    runSingleProviderAction,
  } = props;
  const model = useSessionDetailModel(props);
  const activeSession = model.selectedSession;
  const archiveAction = activeSession?.source === "archived_sessions" ? "unarchive_local" : "archive_local";

  return (
    <section className={`panel session-detail-panel ${!activeSession ? "is-empty" : ""}`.trim()}>
      <PanelHeader title={messages.sessionDetail.title} subtitle={model.headerSubtitle} />
      <div ref={model.bodyRef} className="impact-body">
        {!activeSession ? (
          <>
            {model.sessionActionSummary ? (
              <section className="provider-result-grid provider-result-grid-compact session-result-stage">
                <article className={model.sessionActionCardClass}>
                  <span className="overview-note-label">{messages.providers.actionResultTitle}</span>
                  <strong>{model.sessionActionSummary.headline}</strong>
                  <p>{model.sessionActionSummary.countSummary}</p>
                  <p>{model.sessionActionSummary.detail}</p>
                  {model.sessionActionSummary.previewReady ? (
                    model.sessionActionCanExecute ? (
                      <div className="sub-toolbar provider-result-actions">
                        <Button
                          variant="danger"
                          onClick={model.executeSessionAction}
                          disabled={busy}
                        >
                          {model.executeSessionActionLabel}
                        </Button>
                      </div>
                    ) : (
                      <p className="sub-hint">{messages.providers.resultSelectionChangedHint}</p>
                    )
                  ) : null}
                </article>
              </section>
            ) : null}
            <SessionEmptyState
              messages={messages}
              emptyNextSessions={emptyNextSessions}
              emptyScopeLabel={model.resolvedEmptyScopeLabel}
              onOpenSessionPath={onOpenSessionPath}
            />
          </>
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
              onRunArchiveDryRun={() =>
                runSingleProviderAction(
                  activeSession.provider,
                  activeSession.file_path,
                  archiveAction,
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
