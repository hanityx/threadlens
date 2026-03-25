import type { Messages } from "../../i18n";
import type { ProviderSessionActionResult, ProviderSessionRow } from "../../types";
import { compactSessionTitle } from "./helpers";

export interface BackupHubProps {
  messages: Messages;
  selectedProviderFilePathsCount: number;
  latestBackupCount: number;
  latestExportCount: number;
  providerDeleteBackupEnabled: boolean;
  onProviderDeleteBackupEnabledChange: (checked: boolean) => void;
  canRunProviderBackup: boolean;
  busy: boolean;
  onRunBackupSelected: () => void;
  onRunRecoveryBackupExport: () => void;
  latestBackupPath: string;
  backupFlowHint: string;
  deleteBackupModeLabel: string;
  selectedSessionPreview: ProviderSessionRow | null;
  backupActionResult: ProviderSessionActionResult | null;
}

export function BackupHub(props: BackupHubProps) {
  const {
    messages,
    selectedProviderFilePathsCount,
    latestBackupCount,
    latestExportCount,
    providerDeleteBackupEnabled,
    onProviderDeleteBackupEnabledChange,
    canRunProviderBackup,
    busy,
    onRunBackupSelected,
    onRunRecoveryBackupExport,
    latestBackupPath,
    backupFlowHint,
    deleteBackupModeLabel,
    selectedSessionPreview,
    backupActionResult,
  } = props;

  return (
    <div className="provider-workspace-actions">
      <div className="provider-workspace-actions-head">
        <strong>{messages.providers.backupHubTitle}</strong>
        <span className="sub-hint">
          {messages.providers.backupHubSelected} {selectedProviderFilePathsCount} · latest {latestBackupCount}
        </span>
      </div>
      <div className="provider-workspace-backup-overview" aria-label="backup overview">
        <article className="provider-summary-cell">
          <span>{messages.providers.backupHubSelected}</span>
          <strong>{selectedProviderFilePathsCount}</strong>
        </article>
        <article className="provider-summary-cell">
          <span>{messages.providers.backupHubLatest}</span>
          <strong>{latestBackupCount}</strong>
        </article>
        <article className="provider-summary-cell">
          <span>{messages.providers.backupHubExported}</span>
          <strong>{latestExportCount}</strong>
        </article>
      </div>
      <div className="provider-action-toolbar-inline">
        <label className="check-inline">
          <input
            type="checkbox"
            checked={providerDeleteBackupEnabled}
            onChange={(event) => onProviderDeleteBackupEnabledChange(event.target.checked)}
          />
          {messages.providers.deleteWithBackup}
        </label>
        <button
          className="btn-base"
          type="button"
          disabled={!canRunProviderBackup || busy}
          onClick={onRunBackupSelected}
        >
          {busy ? messages.busy : messages.providers.backupSelected}
        </button>
        <button
          className="btn-outline"
          type="button"
          disabled={busy}
          onClick={onRunRecoveryBackupExport}
        >
          {messages.providers.exportAllBackups}
        </button>
      </div>
      <div className="provider-inline-result is-static">
        <strong>
          {latestBackupCount > 0 ? messages.providers.backupHubLatest : messages.providers.deleteWithBackup}
        </strong>
        <span>{latestBackupCount > 0 ? latestBackupPath : backupFlowHint}</span>
      </div>
      <div className="provider-workspace-backup-meta" aria-label="backup mode">
        <span>
          {messages.providers.deleteWithBackup} {deleteBackupModeLabel}
        </span>
        <span>{messages.providers.deleteWithBackupHint}</span>
      </div>
      {selectedSessionPreview ? (
        <div className="provider-selection-preview">
          <strong>
            {compactSessionTitle(
              selectedSessionPreview.display_title || selectedSessionPreview.probe.detected_title,
              selectedSessionPreview.session_id,
            )}
          </strong>
          <span className="sub-hint">
            {selectedSessionPreview.session_id} · {selectedSessionPreview.provider} · {selectedSessionPreview.probe.format}
          </span>
        </div>
      ) : null}
      {backupActionResult ? (
        <div className="provider-inline-result">
          <strong>Latest backup run</strong>
          <span>
            {messages.providers.valid} {backupActionResult.valid_count} · {messages.providers.applied} {backupActionResult.applied_count}
            {typeof backupActionResult.backed_up_count === "number"
              ? ` · ${messages.providers.backedUp} ${backupActionResult.backed_up_count}`
              : ""}
          </span>
        </div>
      ) : latestExportCount > 0 ? (
        <div className="provider-inline-result">
          <strong>{messages.providers.backupHubExported}</strong>
          <span>{latestExportCount}</span>
        </div>
      ) : null}
    </div>
  );
}
