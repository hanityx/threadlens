import { useEffect, useMemo, useState } from "react";
import { Button } from "@/shared/ui/components/Button";
import { PanelHeader } from "@/shared/ui/components/PanelHeader";
import { LocalePicker } from "@/app/components/LocalePicker";
import { useLocale } from "@/i18n";
import { LOCALE_LABELS } from "@/i18n/locales";
import {
  readPersistedSetupState,
  type SetupCommittedState,
} from "@/shared/lib/appState";
import type {
  DataSourceInventoryRow,
  ProviderMatrixProvider,
  ProviderParserHealthReport,
  ProviderSessionRow,
} from "@/shared/types";
import { formatProviderDisplayName } from "@/shared/lib/format";
import { formatBytes } from "@/shared/lib/format";
import { buildProviderBytesById } from "@/features/overview/model/overviewWorkbenchModel";
import {
  persistSetupCommittedState,
  readStoredSelection,
  resolveSavedSetupSummary,
  resolveSetupPreferredSelection,
  setSetupDefaultProvider,
  type SavedSetupSummary,
  type SetupPreferredSelection,
  toggleSetupSelection,
} from "@/features/overview/model/setupWizardModel";

const WIZARD_COMPLETED_AT_STORAGE_KEY = "po-setup-wizard-completed-at";

export type SetupWizardProps = {
  providers: ProviderMatrixProvider[];
  dataSourceRows: DataSourceInventoryRow[];
  providerSessionProviders: Array<{
    provider: string;
    total_bytes?: number;
  }>;
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

function readStoredCompletedAt(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(WIZARD_COMPLETED_AT_STORAGE_KEY) ?? "";
}

function formatTimestamp(raw: string, locale: string): string {
  if (!raw) return "";
  const time = new Date(raw);
  if (Number.isNaN(time.getTime())) return raw;
  return new Intl.DateTimeFormat(locale, {
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

export function SetupWizard({
  providers,
  dataSourceRows,
  providerSessionProviders,
  providerSessionRows,
  parserReports,
  onClose,
  onApplyPreferredSelection,
}: SetupWizardProps) {
  const { locale, setLocale, messages } = useLocale();
  const [selectedProviderIds, setSelectedProviderIds] = useState<string[]>(readStoredSelection);
  const [savedSetupState, setSavedSetupState] = useState<SetupCommittedState | null>(() => readPersistedSetupState());
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
    return buildProviderBytesById({
      dataSourceRows,
      providerSessionProviders,
      providerSessionRows,
      providers,
    });
  }, [dataSourceRows, providerSessionProviders, providerSessionRows, providers]);

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
    if (completedAt) {
      window.localStorage.setItem(WIZARD_COMPLETED_AT_STORAGE_KEY, completedAt);
      return;
    }
    window.localStorage.removeItem(WIZARD_COMPLETED_AT_STORAGE_KEY);
  }, [completedAt]);

  const selectedCards = selectedProviderIds
    .map((providerId) => providerCards.find((card) => card.providerId === providerId))
    .filter((card): card is WizardProviderCard => Boolean(card));
  const primaryProviderId = selectedCards[0]?.providerId;
  const savedSummary = resolveSavedSetupSummary({
    completedAt,
    savedSetupState,
    providerCards,
    allProvidersLabel: messages.search.allProviders,
    noDefaultSelectedLabel: messages.setup.noDefaultSelected,
  });
  const startHereLabel = locale === "ko" ? "시작점" : "Start here";
  const openFirstLabel = locale === "ko" ? "먼저 열기" : "Open first";
  const overviewLabel = messages.nav.overview;
  const setupOverviewLine =
    locale === "ko"
      ? "카드를 눌러 Overview에 넣거나 빼세요."
      : "Click a card to add or remove it from Overview.";
  const setupStartHereLine =
    locale === "ko"
      ? "시작점은 세션과 검색에서 먼저 열릴 프로바이더만 정합니다. 다른 선택 프로바이더도 그대로 사용할 수 있습니다."
      : "Start here only sets which provider opens first in Sessions and Search. Other selected providers still stay available.";

  const toggleProvider = (providerId: string) => {
    setSelectedProviderIds((current) => toggleSetupSelection(current, providerId));
  };

  const setDefaultProvider = (providerId: string) => {
    setSelectedProviderIds((current) => setSetupDefaultProvider(current, providerId));
  };

  const markComplete = () => {
    const normalizedSelection = normalizeSelectedProviderIds(selectedProviderIds);
    const preferredSelection = resolveSetupPreferredSelection({
      selectedProviderIds: normalizedSelection,
      visibleProviderIds: providerCards.map((card) => card.providerId),
    });
    const committedSelection: SetupCommittedState = {
      selectedProviderIds: normalizedSelection,
      ...preferredSelection,
    };
    persistSetupCommittedState(committedSelection);
    setSavedSetupState(committedSelection);
    onApplyPreferredSelection?.(preferredSelection);
    const now = new Date().toISOString();
    setCompletedAt(now);
  };

  return (
    <section className="panel setup-wizard-panel">
      <PanelHeader
        title={messages.setup.title}
        actions={
          <>
            <LocalePicker
              id="setup-locale"
              locale={locale}
              setLocale={setLocale}
              label={messages.nav.locale}
            />
            <Button variant="accent" onClick={markComplete}>
              {messages.setup.saveAsDefault}
            </Button>
            <button type="button" className="setup-wizard-close" onClick={onClose}>
              {messages.setup.close}
            </button>
          </>
        }
      />

      <div className="setup-wizard-shell">
        <div className="setup-wizard-body">
          <div className="setup-wizard-copy">
            <strong className="setup-wizard-copy-title">{messages.setup.preferredAiTitle}</strong>
            <p>
              <strong>{overviewLabel}</strong>
              {" "}
              {setupOverviewLine}
            </p>
            <p>
              <strong>{startHereLabel}</strong>
              {" "}
              {setupStartHereLine}
            </p>
          </div>
          <div className="setup-wizard-choice-grid">
            {providerCards.map((card) => {
              const selected = selectedProviderIds.includes(card.providerId);
              const isDefault = selected && primaryProviderId === card.providerId;
              const roleLabel =
                isDefault
                  ? startHereLabel
                  : selected
                    ? overviewLabel
                    : card.status === "active"
                      ? messages.setup.roleActive
                      : card.status === "detected"
                        ? messages.setup.roleDetected
                        : messages.setup.roleMissing;
              return (
                <div
                  key={card.providerId}
                  className={`setup-wizard-choice ${selected ? "is-selected" : ""}`}
                >
                  <button
                    type="button"
                    className="setup-wizard-choice-select"
                    onClick={() => toggleProvider(card.providerId)}
                    aria-pressed={selected}
                  >
                    <div className="setup-wizard-choice-head">
                      <h3>{card.name}</h3>
                      <div className="setup-wizard-choice-actions">
                        <span
                          className={`status-pill ${
                            selected
                              ? isDefault
                                ? "status-active"
                                : "status-preview"
                              : `status-${card.status === "missing" ? "missing" : card.status === "active" ? "active" : "detected"}`
                          }`}
                        >
                          {roleLabel}
                        </span>
                      </div>
                    </div>
                    <div className="setup-wizard-choice-meta">
                      <span>{card.sessionCount} {messages.setup.sessionsUnit}</span>
                      <span>{formatBytes(card.totalBytes)}</span>
                      <span>{card.rootCount} {messages.setup.rootsUnit}</span>
                    </div>
                  </button>
                  {selected && !isDefault ? (
                    <div className="setup-wizard-choice-footer">
                      <button
                        type="button"
                        className="setup-wizard-choice-default"
                        onClick={() => setDefaultProvider(card.providerId)}
                      >
                        {openFirstLabel}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {completedAt || expandedAfterComplete ? (
            <div className="setup-wizard-complete setup-wizard-complete-compact">
              <div className="setup-wizard-complete-copy">
                <strong>{messages.setup.savedDefaultTitle}</strong>
                <p>
                  {savedSummary?.focusLabel ?? messages.setup.noDefaultSelected} · {formatBytes(savedSummary?.primaryProviderBytes ?? 0)} · {completedAt ? formatTimestamp(completedAt, locale) : messages.setup.pending}
                </p>
                <span className="setup-wizard-complete-note">
                  {messages.setup.sessionsLineLabel} → {savedSummary?.providerViewLabel ?? "all"} · {messages.setup.searchLineLabel} → {savedSummary?.searchLabel ?? "all"}
                </span>
                {savedSummary?.watchingLabel ? (
                  <span className="setup-wizard-complete-note">{messages.setup.watchingLineLabel} → {savedSummary.watchingLabel}</span>
                ) : null}
              </div>
            </div>
          ) : null}

        </div>
      </div>
    </section>
  );
}
