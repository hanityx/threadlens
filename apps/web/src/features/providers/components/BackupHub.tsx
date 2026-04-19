import type { Messages } from "@/i18n";
import { Button } from "@/shared/ui/components/Button";
import type { ProviderSessionActionResult, ProviderSessionRow } from "@/shared/types";
import { compactSessionTitle } from "@/features/providers/lib/helpers";

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
      <div className="provider-action-toolbar-inline">
        <label className="check-inline">
          <input
            type="checkbox"
            checked={providerDeleteBackupEnabled}
            onChange={(event) => onProviderDeleteBackupEnabledChange(event.target.checked)}
          />
          {messages.providers.deleteWithBackup}
        </label>
        <Button
          variant="base"
          disabled={!canRunProviderBackup || busy}
          onClick={onRunBackupSelected}
        >
          {busy ? messages.busy : messages.providers.backupSelected}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={onRunRecoveryBackupExport}
        >
          {messages.providers.exportAllBackups}
        </Button>
      </div>
      <div className="provider-inline-result is-static">
        <strong>
          {messages.providers.backupHubSelected} {selectedProviderFilePathsCount} · {messages.providers.backupHubLatest} {latestBackupCount} · {messages.providers.backupHubExported} {latestExportCount}
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
          <strong>{messages.providers.latestBackupRunTitle}</strong>
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
