import {
  PROVIDER_VIEW_STORAGE_KEY,
  readPersistedSetupState,
  SEARCH_PROVIDER_STORAGE_KEY,
  SETUP_PREFERRED_PROVIDER_STORAGE_KEY,
  SETUP_SELECTION_STORAGE_KEY,
  type SetupCommittedState,
  writeCommittedSetupState,
  writeStorageValue,
} from "@/shared/lib/appState";
import { formatProviderDisplayName } from "@/shared/lib/format";

export type SetupPreferredSelection = {
  preferredProviderId: string;
  providerView: string;
  searchProvider: string;
};

export type SavedSetupSummary = {
  focusLabel: string;
  watchingLabel: string;
  providerViewLabel: string;
  searchLabel: string;
  primaryProviderBytes: number;
};

type WizardProviderCard = {
  providerId: string;
  name: string;
  status?: "active" | "detected" | "missing";
  sourceCount?: number;
  sessionCount?: number;
  totalBytes: number;
  parseScore?: number | null;
  canRead?: boolean;
  canAnalyze?: boolean;
  canSafeCleanup?: boolean;
  rootCount?: number;
};

function normalizeSelectedProviderIds(selectedProviderIds: string[]): string[] {
  return Array.from(
    new Set(
      selectedProviderIds
        .map((item) => String(item || "").trim())
        .filter((item) => Boolean(item) && item !== "chatgpt"),
    ),
  );
}

export function readStoredSelection(): string[] {
  return readPersistedSetupState()?.selectedProviderIds ?? [];
}

export function toggleSetupSelection(current: string[], providerId: string): string[] {
  const normalizedCurrent = current
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (normalizedCurrent.includes(providerId)) {
    return normalizedCurrent.filter((item) => item !== providerId);
  }
  return [...normalizedCurrent, providerId];
}

export function setSetupDefaultProvider(current: string[], providerId: string): string[] {
  const normalizedCurrent = current
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  if (!normalizedCurrent.includes(providerId)) {
    return normalizedCurrent.length > 0 ? [providerId, ...normalizedCurrent] : [providerId];
  }
  return [providerId, ...normalizedCurrent.filter((item) => item !== providerId)];
}

export function resolveSetupPreferredSelection(options: {
  selectedProviderIds: string[];
  visibleProviderIds: Iterable<string>;
}): SetupPreferredSelection {
  const normalizedSelection = normalizeSelectedProviderIds(options.selectedProviderIds);
  const visibleProviderIdSet = new Set(
    Array.from(options.visibleProviderIds, (item) => String(item || "").trim()).filter(Boolean),
  );
  const preferredProviderId =
    normalizedSelection.find((providerId) => visibleProviderIdSet.has(providerId)) ??
    normalizedSelection[0] ??
    "all";

  return {
    preferredProviderId,
    providerView:
      preferredProviderId !== "all" && visibleProviderIdSet.has(preferredProviderId)
        ? preferredProviderId
        : "all",
    searchProvider: preferredProviderId,
  };
}

export function persistSetupPreferredSelection(selection: SetupPreferredSelection) {
  writeStorageValue(PROVIDER_VIEW_STORAGE_KEY, selection.providerView);
  writeStorageValue(SEARCH_PROVIDER_STORAGE_KEY, selection.searchProvider);
  writeStorageValue(SETUP_PREFERRED_PROVIDER_STORAGE_KEY, selection.preferredProviderId);
}

export function persistSetupSelectionIds(selectionIds: string[]) {
  writeStorageValue(SETUP_SELECTION_STORAGE_KEY, JSON.stringify(normalizeSelectedProviderIds(selectionIds)));
}

export function persistSetupCommittedState(selection: SetupCommittedState) {
  writeCommittedSetupState(selection);
  persistSetupSelectionIds(selection.selectedProviderIds);
  persistSetupPreferredSelection(selection);
}

export function resolveSavedSetupSummary(options: {
  completedAt: string;
  savedSetupState: SetupCommittedState | null;
  providerCards: WizardProviderCard[];
  allProvidersLabel: string;
  noDefaultSelectedLabel: string;
}): SavedSetupSummary | null {
  if (!options.completedAt || !options.savedSetupState) return null;
  const savedSelectedCards = options.savedSetupState.selectedProviderIds
    .map((providerId) => options.providerCards.find((card) => card.providerId === providerId))
    .filter((card): card is WizardProviderCard => Boolean(card));
  const savedWatchingCards = savedSelectedCards.filter(
    (card) => card.providerId !== options.savedSetupState?.preferredProviderId,
  );
  const savedPrimaryCard =
    savedSelectedCards.find(
      (card) => card.providerId === options.savedSetupState?.preferredProviderId,
    ) ??
    savedSelectedCards[0] ??
    null;

  return {
    focusLabel: savedPrimaryCard?.name || options.noDefaultSelectedLabel,
    watchingLabel: savedWatchingCards.map((card) => card.name).join(", "),
    providerViewLabel:
      options.savedSetupState.providerView === "all"
        ? options.allProvidersLabel
        : formatProviderDisplayName(options.savedSetupState.providerView),
    searchLabel:
      options.savedSetupState.searchProvider === "all"
        ? options.allProvidersLabel
        : formatProviderDisplayName(options.savedSetupState.searchProvider),
    primaryProviderBytes: savedPrimaryCard?.totalBytes ?? 0,
  };
}
