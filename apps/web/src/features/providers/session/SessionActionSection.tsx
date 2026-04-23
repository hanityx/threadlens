import { Button } from "@/shared/ui/components/Button";
import type { Messages } from "@/i18n";
import type { ProviderSessionRow } from "@/shared/types";

export function SessionActionSection(props: {
  messages: Messages;
  selectedSession: ProviderSessionRow;
  sessionActionSummary: {
    headline: string;
    countSummary: string;
    detail: string;
    token?: string;
    previewReady?: boolean;
  } | null;
  sessionActionCardClass: string;
  sessionActionCanExecute: boolean;
  executeSessionActionLabel: string;
  busy: boolean;
  executeSessionAction: () => void;
  isElectronRuntime: boolean;
  copyNotice: string;
  onCopyTitle: () => void;
  onCopyId: () => void;
  onCopyPath: () => void;
  onRevealInFinder: () => void;
  onOpenFile: () => void;
  onPreviewFile: () => void;
  onOpenNewWindow: () => void;
  onRunArchiveDryRun: () => void;
  onRunDeleteDryRun: () => void;
  onRequestHardDeleteConfirm: () => void;
  onOpenFolder: () => void;
  canRunSessionAction: boolean;
  hardDeleteConfirmOpen: boolean;
  hardDeleteSkipConfirmChecked: boolean;
  onToggleHardDeleteSkipConfirmChecked: (checked: boolean) => void;
  onCancelHardDeleteConfirm: () => void;
  onConfirmHardDelete: () => void;
}) {
  const {
    messages,
    selectedSession,
    sessionActionSummary,
    sessionActionCardClass,
    sessionActionCanExecute,
    executeSessionActionLabel,
    busy,
    executeSessionAction,
    isElectronRuntime,
    copyNotice,
    onCopyTitle,
    onCopyId,
    onCopyPath,
    onRevealInFinder,
    onOpenFile,
    onPreviewFile,
    onOpenNewWindow,
    onRunArchiveDryRun,
    onRunDeleteDryRun,
    onRequestHardDeleteConfirm,
    onOpenFolder,
    canRunSessionAction,
    hardDeleteConfirmOpen,
    hardDeleteSkipConfirmChecked,
    onToggleHardDeleteSkipConfirmChecked,
    onCancelHardDeleteConfirm,
    onConfirmHardDelete,
  } = props;
  const archiveActionLabel =
    selectedSession.source === "archived_sessions"
      ? messages.providers.unarchiveDryRun
      : messages.sessionDetail.archiveDryRun;

  return (
    <>
      {sessionActionSummary ? (
        <section className="provider-result-grid provider-result-grid-compact session-result-stage">
          <article className={sessionActionCardClass}>
            <span className="overview-note-label">{messages.providers.actionResultTitle}</span>
            <strong>{sessionActionSummary.headline}</strong>
            <p>{sessionActionSummary.countSummary}</p>
            <p>{sessionActionSummary.detail}</p>
            {sessionActionSummary.previewReady ? (
              sessionActionCanExecute ? (
                <div className="sub-toolbar provider-result-actions">
                  <Button
                    variant="danger"
                    onClick={executeSessionAction}
                    disabled={busy}
                  >
                    {executeSessionActionLabel}
                  </Button>
                </div>
              ) : (
                <p className="sub-hint">{messages.providers.resultSelectionChangedHint}</p>
              )
            ) : null}
          </article>
        </section>
      ) : null}
      <div className="session-detail-top-grid">
        <details className="detail-section detail-section-actions">
          <summary>{messages.sessionDetail.sectionActions}</summary>
          <div className="detail-section-body">
            <div className="chat-toolbar detail-action-bar detail-action-bar-compact session-copy-actions">
              <Button variant="outline" onClick={onCopyTitle}>
                {messages.sessionDetail.copyTitle}
              </Button>
              <Button variant="outline" onClick={onCopyId}>
                {messages.sessionDetail.copyId}
              </Button>
              <Button variant="outline" onClick={onCopyPath}>
                {messages.sessionDetail.copyPath}
              </Button>
            </div>
            {isElectronRuntime ? (
              <div className="chat-toolbar detail-action-bar detail-action-bar-compact detail-action-bar-desktop session-desktop-actions">
                <Button variant="outline" onClick={onRevealInFinder}>
                  {messages.sessionDetail.revealInFinder}
                </Button>
                <Button variant="outline" onClick={onOpenFile}>
                  {messages.sessionDetail.openFile}
                </Button>
                <Button variant="outline" onClick={onPreviewFile}>
                  {messages.sessionDetail.previewFile}
                </Button>
                <Button variant="outline" onClick={onOpenNewWindow}>
                  {messages.sessionDetail.openInNewWindow}
                </Button>
              </div>
            ) : null}
            {copyNotice ? <p className="sub-hint">{copyNotice}</p> : null}
            <div className="detail-actions-primary session-detail-actions-primary">
              <div className="chat-toolbar detail-action-bar session-manage-actions">
                <Button
                  variant="outline"
                  onClick={onRunArchiveDryRun}
                  disabled={busy || !canRunSessionAction}
                >
                  {archiveActionLabel}
                </Button>
                <Button
                  variant="outline"
                  onClick={onRunDeleteDryRun}
                  disabled={busy || !canRunSessionAction}
                >
                  {messages.sessionDetail.deleteDryRun}
                </Button>
                <Button
                  variant="outline"
                  onClick={onOpenFolder}
                  disabled={!selectedSession}
                >
                  {messages.sessionDetail.openFolder}
                </Button>
                <Button
                  variant="danger"
                  onClick={onRequestHardDeleteConfirm}
                  disabled={busy || !canRunSessionAction}
                >
                  {messages.providers.delete}
                </Button>
              </div>
            </div>
            {hardDeleteConfirmOpen ? (
              <div className="provider-hard-delete-confirm session-hard-delete-confirm" role="dialog" aria-modal="true">
                <div className="provider-hard-delete-confirm-card">
                  <span className="overview-note-label">{messages.providers.delete}</span>
                  <strong>{messages.providers.hardDeleteConfirmTitle}</strong>
                  <p>{messages.providers.hardDeleteConfirmBody}</p>
                  <label className="check-inline">
                    <input
                      type="checkbox"
                      checked={hardDeleteSkipConfirmChecked}
                      onChange={(event) => onToggleHardDeleteSkipConfirmChecked(event.target.checked)}
                    />
                    {messages.providers.hardDeleteConfirmSkipFuture}
                  </label>
                  <div className="chat-toolbar detail-action-bar detail-action-bar-danger provider-hard-delete-confirm-actions">
                    <Button variant="outline" onClick={onCancelHardDeleteConfirm}>
                      {messages.providers.hardDeleteConfirmCancel}
                    </Button>
                    <Button variant="danger" disabled={busy} onClick={onConfirmHardDelete}>
                      {messages.providers.hardDeleteConfirmExecute}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
            {!canRunSessionAction ? (
              <p className="sub-hint">{messages.sessionDetail.readOnlyHint}</p>
            ) : null}
          </div>
        </details>
      </div>
    </>
  );
}
