import { useMemo, useState } from "react";
import type { Messages } from "@/i18n";
import { apiPost } from "@/api";
import { Button } from "@/shared/ui/components/Button";
import type { ProviderSessionActionResult } from "@/shared/types";
import "./backupHub.css";

type FolderOpenResult = {
  ok: boolean;
  error?: string | null;
};

type LegacyBackupSet = {
  backup_id: string;
  path: string;
  file_count: number;
  total_bytes: number;
  latest_mtime: string;
};

type GroupedBackupProgressView = {
  current: number;
  total: number;
  providerLabel: string;
};

export interface BackupHubProps {
  messages: Messages;
  selectedProviderFilePathsCount: number;
  availableBackupSets: number;
  canRunProviderBackup: boolean;
  backupPending: boolean;
  exportPending: boolean;
  onRunBackupSelected: () => void;
  onRunBackupSelectedExport: () => void;
  onRunRecoveryBackupExport: () => void;
  backupRoot: string;
  exportRoot: string;
  onBackupRootChange: (value: string) => void;
  onExportRootChange: (value: string) => void;
  onResetBackupRoot: () => void;
  onResetExportRoot: () => void;
  latestBackupPath: string;
  backupFolderHint: string;
  latestExportPath: string;
  backupSelectionHint: string;
  backupActionResult: ProviderSessionActionResult | null;
  legacyBackupSets?: LegacyBackupSet[];
  groupedBackupProgress?: GroupedBackupProgressView | null;
  canPickDirectories?: boolean;
}

function BackupPathField(props: {
  label: string;
  value: string;
  hint: string;
  onChange: (value: string) => void;
  onReset: () => void;
  disabled?: boolean;
  placeholder?: string;
  pickerLabel?: string;
  pickerDisabled?: boolean;
  onPick?: () => void | Promise<void>;
  helperText?: string;
  noticeText?: string;
}) {
  const {
    label,
    value,
    hint,
    onChange,
    onReset,
    disabled,
    placeholder,
    pickerLabel,
    pickerDisabled,
    onPick,
    helperText,
    noticeText,
  } = props;
  const hasPicker = Boolean(pickerLabel && onPick);
  return (
    <label className="provider-backup-path-field">
      <span className="provider-backup-path-label">{label}</span>
      <div className={`provider-backup-path-row${hasPicker ? " has-picker" : ""}`}>
        <input
          className="search-input provider-backup-path-input"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        />
        {hasPicker ? (
          <Button variant="outline" onClick={onPick} disabled={pickerDisabled}>
            {pickerLabel}
          </Button>
        ) : null}
        <Button variant="outline" onClick={onReset} disabled={disabled}>
          {hint}
        </Button>
      </div>
      {helperText ? <p className="sub-hint">{helperText}</p> : null}
      {noticeText ? <p className="sub-hint">{noticeText}</p> : null}
    </label>
  );
}

export function BackupHub(props: BackupHubProps) {
  const {
    messages,
    selectedProviderFilePathsCount,
    availableBackupSets,
    canRunProviderBackup,
    backupPending,
    exportPending,
    onRunBackupSelected,
    onRunBackupSelectedExport,
    onRunRecoveryBackupExport,
    backupRoot,
    exportRoot,
    onBackupRootChange,
    onExportRootChange,
    onResetBackupRoot,
    onResetExportRoot,
    latestBackupPath,
    backupFolderHint,
    latestExportPath,
    backupSelectionHint,
    backupActionResult,
    legacyBackupSets = [],
    groupedBackupProgress = null,
    canPickDirectories: canPickDirectoriesProp,
  } = props;
  const [pathPickerNotice, setPathPickerNotice] = useState<{
    target: "backup" | "export" | null;
    message: string;
  }>({
    target: null,
    message: "",
  });
  const [pathPickerPending, setPathPickerPending] = useState<"backup" | "export" | null>(null);
  const [desktopActionNotice, setDesktopActionNotice] = useState<{
    target: "backup" | "export" | null;
    message: string;
  }>({
    target: null,
    message: "",
  });
  const canPickDirectories = useMemo(() => {
    if (typeof canPickDirectoriesProp === "boolean") return canPickDirectoriesProp;
    return typeof window !== "undefined" && Boolean(window.threadLensDesktop?.pickDirectory);
  }, [canPickDirectoriesProp]);
  const canOpenDesktopPath = true;
  const latestBackupFolderPath = useMemo(() => {
    const latestPath = String(latestBackupPath || "").trim();
    if (latestPath && latestPath !== messages.providers.backupNoneYet) return latestPath;
    return String(backupRoot || "").trim();
  }, [backupRoot, latestBackupPath, messages.providers.backupNoneYet]);
  const latestExportFolderPath = useMemo(
    () => String(exportRoot || "").trim(),
    [exportRoot],
  );
  const exportFolderHelper = messages.providers.exportFolderHelper.replace("{path}", exportRoot);

  async function pickDirectory(target: "backup" | "export") {
    if (!canPickDirectories || !window.threadLensDesktop?.pickDirectory) return;
    setPathPickerPending(target);
    setPathPickerNotice({ target: null, message: "" });
    const initialPath = target === "backup" ? backupRoot : exportRoot;
    try {
      const result: ThreadLensDesktopDirectoryResult = await window.threadLensDesktop.pickDirectory(initialPath);
      if (!result?.ok) {
        setPathPickerNotice({
          target,
          message: result?.error || messages.providers.folderPickerUnavailable,
        });
        return;
      }
      if (result.canceled || !result.path) return;
      if (target === "backup") {
        onBackupRootChange(result.path);
      } else {
        onExportRootChange(result.path);
      }
    } catch (error) {
      setPathPickerNotice({
        target,
        message: error instanceof Error ? error.message : messages.providers.folderPickerUnavailable,
      });
    } finally {
      setPathPickerPending(null);
    }
  }

  async function openDesktopPath(target: "backup" | "export", filePath: string) {
    if (!filePath.trim()) return;
    setDesktopActionNotice({ target: null, message: "" });
    try {
      const result = (window.threadLensDesktop?.openPath
        ? await window.threadLensDesktop.openPath(filePath)
        : await apiPost<FolderOpenResult>("/api/recovery-open-folder", {
            folder_path: filePath,
            root_path: target === "backup" ? backupRoot : exportRoot,
          })) as FolderOpenResult;
      if (!result?.ok) {
        setDesktopActionNotice({
          target,
          message: result?.error || messages.sessionDetail.desktopUnavailable,
        });
      }
    } catch (error) {
      setDesktopActionNotice({
        target,
        message: error instanceof Error ? error.message : messages.sessionDetail.desktopUnavailable,
      });
    }
  }

  return (
    <div className="provider-backup-center">
      <section className="provider-backup-block">
        <div className="provider-backup-block-head">
          <strong>{messages.providers.backupSaveTitle}</strong>
          <span className="sub-hint">
            {messages.providers.backupHubSelected} {selectedProviderFilePathsCount}
          </span>
        </div>
        <BackupPathField
          label={messages.providers.backupFolder}
          value={backupRoot}
          placeholder={messages.providers.backupDefaultRoot}
          hint={messages.providers.resetDefaultPath}
          pickerLabel={canPickDirectories ? messages.providers.pickFolder : undefined}
          pickerDisabled={!canPickDirectories || backupPending || pathPickerPending !== null}
          onPick={canPickDirectories ? () => pickDirectory("backup") : undefined}
          helperText={backupFolderHint}
          noticeText={
            pathPickerPending === "backup"
              ? messages.providers.folderPickerBusy
              : pathPickerNotice.target === "backup"
                ? pathPickerNotice.message
                : ""
          }
          onChange={onBackupRootChange}
          onReset={onResetBackupRoot}
          disabled={backupPending}
        />
        <div className="provider-inline-result is-static">
          <strong>{messages.providers.latestSavedBackup}</strong>
          <span>{latestBackupPath}</span>
        </div>
        {desktopActionNotice.target === "backup" ? (
          <p className="sub-hint">{desktopActionNotice.message}</p>
        ) : null}
        {backupActionResult ? (
          <div className="provider-inline-result">
            <strong>{messages.providers.latestBackupRunTitle}</strong>
            <span>
              {messages.providers.valid} {backupActionResult.valid_count} · {messages.providers.applied}{" "}
              {backupActionResult.applied_count}
              {typeof backupActionResult.backed_up_count === "number"
                ? ` · ${messages.providers.backedUp} ${backupActionResult.backed_up_count}`
                : ""}
            </span>
          </div>
        ) : null}
        <div className="provider-action-toolbar-inline">
          <Button
            variant="base"
            disabled={!canRunProviderBackup || backupPending}
            onClick={() => {
              setDesktopActionNotice({ target: null, message: "" });
              onRunBackupSelected();
            }}
          >
            {backupPending ? messages.providers.backupSelectedBusy : messages.providers.backupSelected}
          </Button>
          <Button
            variant="outline"
            disabled={!canRunProviderBackup || backupPending || exportPending}
            onClick={() => {
              setDesktopActionNotice({ target: null, message: "" });
              onRunBackupSelectedExport();
            }}
          >
            {exportPending ? messages.providers.exportAllBackupsBusy : messages.providers.backupSelectedExport}
          </Button>
          {canOpenDesktopPath ? (
            <Button
              variant="outline"
              disabled={!latestBackupFolderPath}
              onClick={() => void openDesktopPath("backup", latestBackupFolderPath)}
            >
              {messages.sessionDetail.openFolder}
            </Button>
          ) : null}
        </div>
        {groupedBackupProgress ? (
          <p className="sub-hint">
            {messages.providers.backupSelectedBusy}{" "}
            ({groupedBackupProgress.providerLabel} {groupedBackupProgress.current}/
            {groupedBackupProgress.total})
          </p>
        ) : null}
        {backupSelectionHint ? <p className="sub-hint">{backupSelectionHint}</p> : null}
        {legacyBackupSets.length > 0 ? (
          <details className="provider-backup-legacy-block">
            <summary className="provider-backup-block-head provider-backup-summary">
              <strong>{messages.providers.legacyBackupsTitle}</strong>
            </summary>
            <div className="provider-backup-collapsible-body provider-backup-legacy-body">
              <p className="sub-hint">{messages.providers.legacyBackupsHint}</p>
              {legacyBackupSets.slice(0, 3).map((backupSet) => (
                <span key={backupSet.backup_id}>{backupSet.path}</span>
              ))}
            </div>
          </details>
        ) : null}
      </section>

      <details className="provider-backup-block provider-backup-export-block">
        <summary className="provider-backup-block-head provider-backup-summary">
          <strong>{messages.providers.backupExportTitle}</strong>
        </summary>
        <div className="provider-backup-collapsible-body">
          <BackupPathField
            label={messages.providers.exportFolder}
            value={exportRoot}
            placeholder={messages.providers.exportDefaultRoot}
            hint={messages.providers.resetDefaultPath}
            pickerLabel={canPickDirectories ? messages.providers.pickFolder : undefined}
            pickerDisabled={!canPickDirectories || exportPending || pathPickerPending !== null}
            onPick={canPickDirectories ? () => pickDirectory("export") : undefined}
            helperText={exportFolderHelper}
            noticeText={
              pathPickerPending === "export"
                ? messages.providers.folderPickerBusy
                : pathPickerNotice.target === "export"
                  ? pathPickerNotice.message
                  : ""
            }
            onChange={onExportRootChange}
            onReset={onResetExportRoot}
            disabled={exportPending}
          />
          <div className="provider-inline-result is-static">
            <strong>{messages.providers.latestExportArchive}</strong>
            <span>{latestExportPath}</span>
          </div>
          <div className="provider-inline-result is-static">
            <strong>{messages.providers.backupSetsAvailable}</strong>
            <span>{availableBackupSets}</span>
          </div>
          {desktopActionNotice.target === "export" ? (
            <p className="sub-hint">{desktopActionNotice.message}</p>
          ) : null}
          <div className="provider-action-toolbar-inline">
            <Button
              variant="outline"
              disabled={exportPending || availableBackupSets <= 0}
              onClick={() => {
                setDesktopActionNotice({ target: null, message: "" });
                onRunRecoveryBackupExport();
              }}
            >
              {exportPending ? messages.providers.exportAllBackupsBusy : messages.providers.exportAllBackups}
            </Button>
            {canOpenDesktopPath ? (
              <Button
                variant="outline"
                disabled={!latestExportFolderPath}
                onClick={() => void openDesktopPath("export", latestExportFolderPath)}
              >
                {messages.sessionDetail.openFolder}
              </Button>
            ) : null}
          </div>
        </div>
      </details>
    </div>
  );
}
