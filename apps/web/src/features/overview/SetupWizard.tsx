import { useEffect, useMemo, useState } from "react";
import { Button } from "../../design-system/Button";
import { PanelHeader } from "../../design-system/PanelHeader";
import {
  PROVIDER_VIEW_STORAGE_KEY,
  SETUP_PREFERRED_PROVIDER_STORAGE_KEY,
  SETUP_SELECTION_STORAGE_KEY,
  SEARCH_PROVIDER_STORAGE_KEY,
  writeStorageValue,
} from "../../hooks/appDataUtils";
import type {
  DataSourceInventoryRow,
  ProviderMatrixProvider,
  ProviderParserHealthReport,
  ProviderSessionRow,
} from "../../types";
import { formatProviderDisplayName } from "../../lib/helpers";
import { formatBytes } from "../providers/helpers";

const WIZARD_COMPLETED_AT_STORAGE_KEY = "po-setup-wizard-completed-at";

export type SetupPreferredSelection = {
  preferredProviderId: string;
  providerView: string;
  searchProvider: string;
};

export type SetupWizardProps = {
  providers: ProviderMatrixProvider[];
  dataSourceRows: DataSourceInventoryRow[];
  providerSessionRows: ProviderSessionRow[];
  parserReports: ProviderParserHealthReport[];
  providersRefreshing: boolean;
  providersLastRefreshAt: string;
  onRefresh: () => void;
  onOpenProviders: (providerId?: string) => void;
  onOpenSearch: () => void;
  onClose: () => void;
  onApplyPreferredSelection?: (selection: SetupPreferredSelection) => void;
};

type WizardProviderCard = {
  providerId: string;
  name: string;
  status: "active" | "detected" | "missing";
  sourceCount: number;
  sessionCount: number;
  totalBytes: number;
  parseScore: number | null;
  canRead: boolean;
  canAnalyze: boolean;
  canSafeCleanup: boolean;
  rootCount: number;
};

function providerFromDataSource(sourceKey: string): string | null {
  const key = sourceKey.toLowerCase();
  if (key.startsWith("claude")) return "claude";
  if (key.startsWith("gemini")) return "gemini";
  if (key.startsWith("copilot")) return "copilot";
  if (key.startsWith("chat_")) return "chatgpt";
  if (
    key.startsWith("codex_") ||
    key === "sessions" ||
    key === "archived_sessions" ||
    key === "history" ||
    key === "global_state"
  ) {
    return "codex";
  }
  return null;
}

function readStoredSelection(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SETUP_SELECTION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function readStoredCompletedAt(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(WIZARD_COMPLETED_AT_STORAGE_KEY) ?? "";
}

function formatTimestamp(raw: string): string {
  if (!raw) return "Not completed yet";
  const time = new Date(raw);
  if (Number.isNaN(time.getTime())) return raw;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(time);
}

function normalizeSelectedProviderIds(selectedProviderIds: string[]): string[] {
  return Array.from(
    new Set(
      selectedProviderIds
        .map((item) => String(item || "").trim())
        .filter((item) => Boolean(item) && item !== "chatgpt"),
    ),
  );
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

export function SetupWizard({
  providers,
  dataSourceRows,
  providerSessionRows,
  parserReports,
  onClose,
  onApplyPreferredSelection,
}: SetupWizardProps) {
  const [selectedProviderIds, setSelectedProviderIds] = useState<string[]>(readStoredSelection);
  const [completedAt, setCompletedAt] = useState<string>(readStoredCompletedAt);
  const [expandedAfterComplete] = useState(false);

  const sessionCountByProvider = useMemo(() => {
    const map = new Map<string, number>();
    providers.forEach((provider) => {
      const sessionLogCount = Number(provider.evidence?.session_log_count ?? 0);
      if (sessionLogCount > 0) {
        map.set(provider.provider, sessionLogCount);
      }
    });
    providerSessionRows.forEach((row) => {
      if (map.has(row.provider)) return;
      map.set(row.provider, (map.get(row.provider) ?? 0) + 1);
    });
    return map;
  }, [providerSessionRows, providers]);

  const sessionBytesByProvider = useMemo(() => {
    const map = new Map<string, number>();
    dataSourceRows.forEach((row) => {
      const providerId = providerFromDataSource(row.source_key);
      if (!providerId || !row.present) return;
      map.set(providerId, (map.get(providerId) ?? 0) + Number(row.total_bytes || 0));
    });
    providerSessionRows.forEach((row) => {
      if ((map.get(row.provider) ?? 0) > 0) return;
      map.set(row.provider, (map.get(row.provider) ?? 0) + Number(row.size_bytes || 0));
    });
    return map;
  }, [dataSourceRows, providerSessionRows]);

  const sourceCountByProvider = useMemo(() => {
    const map = new Map<string, number>();
    dataSourceRows.forEach((row) => {
      const providerId = providerFromDataSource(row.source_key);
      if (!providerId || !row.present) return;
      map.set(providerId, (map.get(providerId) ?? 0) + 1);
    });
    return map;
  }, [dataSourceRows]);

  const parserScoreByProvider = useMemo(() => {
    const map = new Map<string, number | null>();
    parserReports.forEach((report) => {
      map.set(report.provider, report.parse_score);
    });
    return map;
  }, [parserReports]);

  const providerCards = useMemo<WizardProviderCard[]>(() => {
    return providers
      .filter((provider) => provider.provider !== "chatgpt")
      .map((provider) => ({
      providerId: provider.provider,
      name: formatProviderDisplayName(provider.name),
      status: provider.status,
      sourceCount: sourceCountByProvider.get(provider.provider) ?? 0,
      sessionCount: sessionCountByProvider.get(provider.provider) ?? 0,
      totalBytes: sessionBytesByProvider.get(provider.provider) ?? 0,
      parseScore: parserScoreByProvider.get(provider.provider) ?? null,
      canRead: provider.capabilities.read_sessions,
      canAnalyze: provider.capabilities.analyze_context,
      canSafeCleanup: provider.capabilities.safe_cleanup,
      rootCount: provider.evidence?.roots?.length ?? 0,
    }));
  }, [parserScoreByProvider, providers, sessionBytesByProvider, sessionCountByProvider, sourceCountByProvider]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextSelection = JSON.stringify(selectedProviderIds);
    window.localStorage.setItem(SETUP_SELECTION_STORAGE_KEY, nextSelection);
  }, [selectedProviderIds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (completedAt) {
      window.localStorage.setItem(WIZARD_COMPLETED_AT_STORAGE_KEY, completedAt);
      return;
    }
    window.localStorage.removeItem(WIZARD_COMPLETED_AT_STORAGE_KEY);
  }, [completedAt]);

  const detectedSourceCount = dataSourceRows.filter((row) => row.present).length;
  const selectedCards = providerCards.filter((card) => selectedProviderIds.includes(card.providerId));
  const primaryProviderId = selectedCards[0]?.providerId;
  const watchingCards = selectedCards.slice(1);
  const activeProviderCount = providerCards.filter((card) => card.status === "active").length;
  const savedSelection = completedAt
    ? resolveSetupPreferredSelection({
        selectedProviderIds,
        visibleProviderIds: providerCards.map((card) => card.providerId),
      })
    : null;
  const savedFocusLabel =
    selectedCards[0]?.name ||
    providerCards.find((card) => card.providerId === savedSelection?.preferredProviderId)?.name ||
    "No default selected";
  const savedWatchingLabel = watchingCards.map((card) => card.name).join(", ");
  const savedProviderViewLabel = savedSelection
    ? savedSelection.providerView === "all"
      ? "All local AI"
      : formatProviderDisplayName(savedSelection.providerView)
    : "all";
  const savedSearchLabel = savedSelection
    ? savedSelection.searchProvider === "all"
      ? "All local AI"
      : formatProviderDisplayName(savedSelection.searchProvider)
    : "all";
  const primaryProviderBytes =
    selectedCards[0]?.totalBytes ??
    providerCards.find((card) => card.providerId === savedSelection?.preferredProviderId)?.totalBytes ??
    0;

  const toggleProvider = (providerId: string) => {
    setSelectedProviderIds((current) => {
      if (current.includes(providerId)) {
        return current.filter((item) => item !== providerId);
      }
      return [...current, providerId];
    });
  };

  const markComplete = () => {
    const preferredSelection = resolveSetupPreferredSelection({
      selectedProviderIds,
      visibleProviderIds: providerCards.map((card) => card.providerId),
    });
    persistSetupPreferredSelection(preferredSelection);
    onApplyPreferredSelection?.(preferredSelection);
    const now = new Date().toISOString();
    setCompletedAt(now);
  };

  return (
    <section className="panel setup-wizard-panel">
      <PanelHeader
        title="Setup"
        subtitle="ready state / default ai"
        actions={
          <>
            <Button variant="accent" onClick={markComplete} disabled={selectedProviderIds.length === 0}>
              Save as default
            </Button>
            <button type="button" className="setup-wizard-close" onClick={onClose}>
              Close setup
            </button>
          </>
        }
      />

      <div className="setup-wizard-shell">
        <section className="setup-wizard-stage">
          <div className="setup-wizard-stage-copy">
            <span className="overview-note-label">ready state</span>
            <strong>Choose one default AI</strong>
            <p>Choose one default first. Keep extras as watched providers for overview lists.</p>
          </div>
          <div className="setup-wizard-stage-pills" aria-label="setup wizard summary">
            <span className="setup-wizard-stage-pill">active · {activeProviderCount}</span>
            <span className="setup-wizard-stage-pill">sources · {detectedSourceCount}</span>
            <span className="setup-wizard-stage-pill">
              default · {savedSelection?.searchProvider === "all" ? "not saved" : savedSearchLabel || "not saved"}
            </span>
            <span className="setup-wizard-stage-pill">watching · {watchingCards.length}</span>
            <span className="setup-wizard-stage-pill">size · {formatBytes(primaryProviderBytes)}</span>
          </div>
        </section>
        <div className="setup-wizard-body">
          <div className="setup-wizard-copy">
            <strong>Preferred AI</strong>
            <p>The first selected provider becomes the default. Any others stay in watch mode for overview.</p>
          </div>
          <div className="setup-wizard-choice-grid">
            {providerCards.map((card) => {
              const selected = selectedProviderIds.includes(card.providerId);
              const roleLabel =
                selected && primaryProviderId === card.providerId
                  ? "Default"
                  : selected
                    ? "Watching"
                    : card.status === "active"
                      ? "Active"
                      : card.status === "detected"
                        ? "Detected"
                        : "Missing";
              return (
                <button
                  key={card.providerId}
                  type="button"
                  className={`setup-wizard-choice ${selected ? "is-selected" : ""}`}
                  onClick={() => toggleProvider(card.providerId)}
                  aria-pressed={selected}
                >
                  <div className="setup-wizard-choice-head">
                    <h3>{card.name}</h3>
                    <span
                      className={`status-pill ${
                        selected
                          ? primaryProviderId === card.providerId
                            ? "status-active"
                            : "status-preview"
                          : `status-${card.status === "missing" ? "missing" : card.status === "active" ? "active" : "detected"}`
                      }`}
                    >
                      {roleLabel}
                    </span>
                  </div>
                  <div className="setup-wizard-choice-meta">
                    <span>{card.sessionCount} sessions</span>
                    <span>{formatBytes(card.totalBytes)}</span>
                    <span>{card.rootCount} roots</span>
                  </div>
                </button>
              );
            })}
          </div>

          {completedAt || expandedAfterComplete ? (
            <div className="setup-wizard-complete setup-wizard-complete-compact">
              <div className="setup-wizard-complete-copy">
                <strong>Saved default</strong>
                <p>
                  {savedFocusLabel} · {formatBytes(primaryProviderBytes)} · {completedAt ? formatTimestamp(completedAt) : "pending"}
                </p>
                <span className="setup-wizard-complete-note">
                  Sessions → {savedProviderViewLabel} · Search → {savedSearchLabel}
                </span>
                {savedWatchingLabel ? (
                  <span className="setup-wizard-complete-note">Watching → {savedWatchingLabel}</span>
                ) : null}
              </div>
            </div>
          ) : null}

        </div>
      </div>
    </section>
  );
}
