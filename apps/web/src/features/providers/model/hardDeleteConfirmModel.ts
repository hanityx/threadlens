import { readStorageValue, writeStorageValue } from "@/shared/lib/appState";

export const PROVIDER_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEY = "po-provider-hard-delete-skip-confirm";
export const LEGACY_PROVIDER_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEY = "cmc-provider-hard-delete-skip-confirm";
export const PROVIDER_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEYS = [
  PROVIDER_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEY,
  LEGACY_PROVIDER_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEY,
] as const;

export function readProviderHardDeleteSkipConfirmPref(
  readValue: (keys: readonly string[]) => string | null = readStorageValue,
) {
  return readValue(PROVIDER_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEYS) === "true";
}

export function writeProviderHardDeleteSkipConfirmPref(
  skipConfirm: boolean,
  writeValue: (key: string, value: string) => void = writeStorageValue,
) {
  writeValue(PROVIDER_HARD_DELETE_SKIP_CONFIRM_STORAGE_KEY, skipConfirm ? "true" : "false");
}

export function buildHardDeleteConfirmRequestState(options: {
  enabled: boolean;
  skipConfirmPref: boolean;
}) {
  if (!options.enabled) {
    return {
      confirmOpen: false,
      shouldRunImmediately: false,
      skipConfirmChecked: false,
    };
  }
  if (options.skipConfirmPref) {
    return {
      confirmOpen: false,
      shouldRunImmediately: true,
      skipConfirmChecked: false,
    };
  }
  return {
    confirmOpen: true,
    shouldRunImmediately: false,
    skipConfirmChecked: false,
  };
}

export function buildHardDeleteConfirmResolvedState(skipConfirmPref: boolean) {
  return {
    confirmOpen: false,
    skipConfirmChecked: false,
    skipConfirmPref,
  };
}
