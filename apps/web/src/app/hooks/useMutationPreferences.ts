import { useEffect, useRef, useState } from "react";
import {
  BACKUP_ROOT_STORAGE_KEY,
  EXPORT_ROOT_STORAGE_KEY,
  LAST_EXPORT_ARCHIVE_PATH_STORAGE_KEY,
  LEGACY_BACKUP_ROOT_STORAGE_KEY,
  LEGACY_EXPORT_ROOT_STORAGE_KEY,
  LEGACY_LAST_EXPORT_ARCHIVE_PATH_STORAGE_KEY,
  PROVIDER_DELETE_BACKUP_ENABLED_STORAGE_KEY,
  readStorageValue,
  writeStorageValue,
} from "@/shared/lib/appState";
import {
  normalizeRecoveryBackupRoot,
  RECOVERY_BACKUP_ROOT_DEBOUNCE_MS,
} from "@/app/hooks/useMutationCore";

function readPersistedBackupRoot() {
  return String(
    readStorageValue([BACKUP_ROOT_STORAGE_KEY, LEGACY_BACKUP_ROOT_STORAGE_KEY]) ?? "",
  ).trim();
}

function readPersistedExportRoot() {
  return String(
    readStorageValue([EXPORT_ROOT_STORAGE_KEY, LEGACY_EXPORT_ROOT_STORAGE_KEY]) ?? "",
  ).trim();
}

function readPersistedLastExportArchivePath() {
  return String(
    readStorageValue([
      LAST_EXPORT_ARCHIVE_PATH_STORAGE_KEY,
      LEGACY_LAST_EXPORT_ARCHIVE_PATH_STORAGE_KEY,
    ]) ?? "",
  ).trim();
}

function readPersistedProviderDeleteBackupEnabled() {
  const raw = String(readStorageValue([PROVIDER_DELETE_BACKUP_ENABLED_STORAGE_KEY]) ?? "").trim();
  return raw !== "false";
}

export function useMutationPreferences() {
  const [providerDeleteBackupEnabled, setProviderDeleteBackupEnabledState] = useState(() =>
    readPersistedProviderDeleteBackupEnabled(),
  );
  const [backupRoot, setBackupRootState] = useState(() => readPersistedBackupRoot());
  const [exportRoot, setExportRootState] = useState(() => readPersistedExportRoot());
  const [latestExportArchivePath, setLatestExportArchivePathState] = useState(() =>
    readPersistedLastExportArchivePath(),
  );
  const backupRootRef = useRef(backupRoot);
  const exportRootRef = useRef(exportRoot);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      writeStorageValue(
        BACKUP_ROOT_STORAGE_KEY,
        normalizeRecoveryBackupRoot(backupRootRef.current),
      );
    }, RECOVERY_BACKUP_ROOT_DEBOUNCE_MS);
    return () => globalThis.clearTimeout(timer);
  }, [backupRoot]);

  const setBackupRoot = (value: string) => {
    const normalized = normalizeRecoveryBackupRoot(value);
    backupRootRef.current = normalized;
    setBackupRootState(normalized);
  };

  const setExportRoot = (value: string) => {
    const normalized = String(value || "").trim();
    exportRootRef.current = normalized;
    setExportRootState(normalized);
    writeStorageValue(EXPORT_ROOT_STORAGE_KEY, normalized);
  };

  const setLatestExportArchivePath = (value: string) => {
    const normalized = String(value || "").trim();
    setLatestExportArchivePathState(normalized);
    writeStorageValue(LAST_EXPORT_ARCHIVE_PATH_STORAGE_KEY, normalized);
  };

  const setProviderDeleteBackupEnabled = (
    value: boolean | ((previous: boolean) => boolean),
  ) => {
    setProviderDeleteBackupEnabledState((previous) => {
      const next = typeof value === "function" ? value(previous) : value;
      writeStorageValue(PROVIDER_DELETE_BACKUP_ENABLED_STORAGE_KEY, String(next));
      return next;
    });
  };

  return {
    providerDeleteBackupEnabled,
    setProviderDeleteBackupEnabled,
    backupRoot,
    setBackupRoot,
    backupRootRef,
    exportRoot,
    setExportRoot,
    exportRootRef,
    latestExportArchivePath,
    setLatestExportArchivePath,
  };
}
