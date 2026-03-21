import { useEffect, useMemo, useState } from "react";
import type {
  DataSourceInventoryRow,
  ProviderMatrixProvider,
  ProviderParserHealthReport,
  ProviderSessionRow,
} from "../types";

const WIZARD_STEP_STORAGE_KEY = "po-setup-wizard-step";
const WIZARD_SELECTION_STORAGE_KEY = "po-setup-wizard-selection";
const WIZARD_COMPLETED_AT_STORAGE_KEY = "po-setup-wizard-completed-at";

type WizardStep = 1 | 2 | 3;

type SetupWizardProps = {
  providers: ProviderMatrixProvider[];
  dataSourceRows: DataSourceInventoryRow[];
  providerSessionRows: ProviderSessionRow[];
  parserReports: ProviderParserHealthReport[];
  providersRefreshing: boolean;
  providersLastRefreshAt: string;
  onRefresh: () => void;
  onOpenProviders: (providerId?: string) => void;
  onOpenDiagnostics: () => void;
};

type WizardProviderCard = {
  providerId: string;
  name: string;
  status: "active" | "detected" | "missing";
  sourceCount: number;
  sessionCount: number;
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

function readStoredStep(): WizardStep {
  if (typeof window === "undefined") return 1;
  const raw = Number(window.localStorage.getItem(WIZARD_STEP_STORAGE_KEY));
  return raw === 2 || raw === 3 ? raw : 1;
}

function readStoredSelection(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WIZARD_SELECTION_STORAGE_KEY);
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

function stepState(
  currentStep: WizardStep,
  step: WizardStep,
  completed: boolean,
): "current" | "done" | "upcoming" {
  if (completed) return "done";
  if (currentStep === step) return "current";
  if (currentStep > step) return "done";
  return "upcoming";
}

export function SetupWizard({
  providers,
  dataSourceRows,
  providerSessionRows,
  parserReports,
  providersRefreshing,
  providersLastRefreshAt,
  onRefresh,
  onOpenProviders,
  onOpenDiagnostics,
}: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>(readStoredStep);
  const [selectedProviderIds, setSelectedProviderIds] = useState<string[]>(readStoredSelection);
  const [completedAt, setCompletedAt] = useState<string>(readStoredCompletedAt);
  const [expandedAfterComplete, setExpandedAfterComplete] = useState(false);

  const sessionCountByProvider = useMemo(() => {
    const map = new Map<string, number>();
    providerSessionRows.forEach((row) => {
      map.set(row.provider, (map.get(row.provider) ?? 0) + 1);
    });
    return map;
  }, [providerSessionRows]);

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
    return providers.map((provider) => ({
      providerId: provider.provider,
      name: provider.name,
      status: provider.status,
      sourceCount: sourceCountByProvider.get(provider.provider) ?? 0,
      sessionCount: sessionCountByProvider.get(provider.provider) ?? 0,
      parseScore: parserScoreByProvider.get(provider.provider) ?? null,
      canRead: provider.capabilities.read_sessions,
      canAnalyze: provider.capabilities.analyze_context,
      canSafeCleanup: provider.capabilities.safe_cleanup,
      rootCount: provider.evidence?.roots?.length ?? 0,
    }));
  }, [parserScoreByProvider, providers, sessionCountByProvider, sourceCountByProvider]);

  const recommendedProviderIds = useMemo(() => {
    return providerCards
      .filter((card) => card.sourceCount > 0 || card.sessionCount > 0 || card.status === "active")
      .map((card) => card.providerId);
  }, [providerCards]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(WIZARD_STEP_STORAGE_KEY, String(currentStep));
  }, [currentStep]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(WIZARD_SELECTION_STORAGE_KEY, JSON.stringify(selectedProviderIds));
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
  const currentStepState = completedAt ? 3 : currentStep;

  const toggleProvider = (providerId: string) => {
    setSelectedProviderIds((current) => {
      if (current.includes(providerId)) {
        return current.filter((item) => item !== providerId);
      }
      return [...current, providerId];
    });
  };

  const goToProviders = (providerId?: string) => {
    onOpenProviders(providerId || primaryProviderId);
  };

  const markComplete = () => {
    const now = new Date().toISOString();
    setCompletedAt(now);
    setCurrentStep(3);
  };

  const rerunWizard = () => {
    setCompletedAt("");
    setCurrentStep(1);
    setExpandedAfterComplete(true);
  };

  const applyRecommendedSelection = () => {
    setSelectedProviderIds(recommendedProviderIds);
  };

  const clearSelection = () => {
    setSelectedProviderIds([]);
  };

  return (
    <section className="panel setup-wizard-panel">
      <header>
        <h2>Provider Setup Wizard</h2>
        <span>Detect local traces, choose the providers to focus on, and save a clean starting state.</span>
      </header>

      <div className="setup-wizard-shell">
        <ol className="setup-wizard-steps" aria-label="Provider setup steps">
          {[
            {
              step: 1 as WizardStep,
              title: "Detect local traces",
              body: "Refresh local roots and cached activity before choosing what to focus on.",
            },
            {
              step: 2 as WizardStep,
              title: "Choose focus providers",
              body: "Pick the providers this dashboard should prioritize first.",
            },
            {
              step: 3 as WizardStep,
              title: "Review readiness",
              body: "Check source coverage, session volume, and whether safe cleanup is available.",
            },
          ].map((item) => {
            const state = stepState(currentStepState, item.step, Boolean(completedAt));
            return (
              <li
                key={item.step}
                className={`setup-wizard-step setup-wizard-step-${state}`}
              >
                <div className="setup-wizard-step-top">
                  <span className="setup-wizard-step-index">Step {item.step}</span>
                  <span className={`status-pill status-${state === "done" ? "active" : state === "current" ? "detected" : "missing"}`}>
                    {state === "done" ? "Done" : state === "current" ? "In progress" : "Upcoming"}
                  </span>
                </div>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
              </li>
            );
          })}
        </ol>

        {completedAt && !expandedAfterComplete ? (
          <div className="setup-wizard-complete setup-wizard-complete-compact">
            <div className="setup-wizard-complete-copy">
              <strong>Initial setup is done</strong>
              <p>
                You do not need to keep this wizard open anymore. Reopen it only when needed, and otherwise jump straight into operations or search.
              </p>
            </div>
            <div className="setup-wizard-metric-row">
              <article className="setup-wizard-metric">
                <span>Focus AI</span>
                <strong>{selectedCards.length || selectedProviderIds.length || providerCards.length}</strong>
              </article>
              <article className="setup-wizard-metric">
                <span>Detected traces</span>
                <strong>{detectedSourceCount}</strong>
              </article>
              <article className="setup-wizard-metric">
                <span>Last saved</span>
                <strong>{formatTimestamp(completedAt)}</strong>
              </article>
            </div>
            <div className="setup-wizard-actions">
              <button type="button" className="btn-accent" onClick={() => goToProviders()}>
                Open providers
              </button>
              <button type="button" className="btn-outline" onClick={() => setExpandedAfterComplete(true)}>
                Reopen wizard
              </button>
            </div>
          </div>
        ) : completedAt ? (
          <div className="setup-wizard-complete">
            <div className="setup-wizard-complete-copy">
              <strong>Setup saved</strong>
              <p>
                Saved the focused view for {selectedCards.length || selectedProviderIds.length || providerCards.length} providers.
              </p>
            </div>
            <div className="setup-wizard-metric-row">
              <article className="setup-wizard-metric">
                <span>Completed at</span>
                <strong>{formatTimestamp(completedAt)}</strong>
              </article>
              <article className="setup-wizard-metric">
                <span>Detected traces</span>
                <strong>{detectedSourceCount}</strong>
              </article>
              <article className="setup-wizard-metric">
                <span>Last refresh</span>
                <strong>{providersLastRefreshAt || "Not refreshed yet"}</strong>
              </article>
            </div>
            <div className="setup-wizard-actions">
              <button type="button" className="btn-accent" onClick={() => goToProviders()}>
                Open providers
              </button>
              <button type="button" className="btn-outline" onClick={onOpenDiagnostics}>
                Open AI diagnostics
              </button>
              <button type="button" className="btn-outline" onClick={() => setExpandedAfterComplete(false)}>
                Collapse
              </button>
              <button type="button" className="btn-outline" onClick={rerunWizard}>
                Run wizard again
              </button>
            </div>
          </div>
        ) : (
          <div className="setup-wizard-body">
            {currentStep === 1 ? (
              <>
                <div className="setup-wizard-copy">
                  <strong>Step 1: detect local provider traces</strong>
                  <p>
                    Refresh local data sources first so the wizard can recommend providers that are actually installed and already producing session logs.
                  </p>
                </div>
                <div className="setup-wizard-metric-row">
                  <article className="setup-wizard-metric">
                    <span>Detected sources</span>
                    <strong>{detectedSourceCount}</strong>
                  </article>
                  <article className="setup-wizard-metric">
                    <span>Known providers</span>
                    <strong>{providerCards.length}</strong>
                  </article>
                  <article className="setup-wizard-metric">
                    <span>Last refresh</span>
                    <strong>{providersLastRefreshAt || "Not refreshed yet"}</strong>
                  </article>
                </div>
                <div className="setup-wizard-actions">
                  <button
                    type="button"
                    className="btn-accent"
                    onClick={onRefresh}
                    disabled={providersRefreshing}
                  >
                    {providersRefreshing ? "Refreshing..." : "Refresh detection"}
                  </button>
                  <button type="button" className="btn-outline" onClick={() => setCurrentStep(2)}>
                    {detectedSourceCount > 0 ? "Continue with detected sources" : "Continue without detection"}
                  </button>
                  <button type="button" className="btn-outline" onClick={() => goToProviders()}>
                    Open providers
                  </button>
                </div>
              </>
            ) : null}

            {currentStep === 2 ? (
              <>
                <div className="setup-wizard-copy">
                  <strong>Step 2: choose focus providers</strong>
                  <p>
                    Pick the providers you care about right now. Nothing is deleted here; the wizard only saves which providers should be emphasized first.
                  </p>
                  <p>
                    Recommended providers are shown as guidance only. Nothing is auto-selected; only your explicit choices are saved.
                  </p>
                </div>
                <div className="info-box">
                  <strong>Recommended targets</strong>
                  <p>
                    {recommendedProviderIds.length > 0
                      ? recommendedProviderIds
                          .map((providerId) => providerCards.find((card) => card.providerId === providerId)?.name ?? providerId)
                          .join(", ")
                      : "No recommendation is ready yet. Refresh detection in step 1 first."}
                  </p>
                </div>
                <div className="setup-wizard-choice-grid">
                  {providerCards.map((card) => {
                    const selected = selectedProviderIds.includes(card.providerId);
                    return (
                      <button
                        key={card.providerId}
                        type="button"
                        className={`setup-wizard-choice ${selected ? "is-selected" : ""}`}
                        onClick={() => toggleProvider(card.providerId)}
                        aria-pressed={selected}
                      >
                        <div className="setup-wizard-choice-head">
                          <strong>{card.name}</strong>
                          <span className={`status-pill status-${card.status === "missing" ? "missing" : card.status === "active" ? "active" : "detected"}`}>
                            {card.status === "active" ? "Active" : card.status === "detected" ? "Detected" : "Missing"}
                          </span>
                        </div>
                        <div className="setup-wizard-choice-meta">
                          <span>{card.sourceCount} traces</span>
                          <span>{card.sessionCount} sessions</span>
                          <span>{card.rootCount} roots</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="setup-wizard-actions">
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={applyRecommendedSelection}
                    disabled={recommendedProviderIds.length === 0}
                  >
                    Select recommended AI only
                  </button>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={clearSelection}
                    disabled={selectedProviderIds.length === 0}
                  >
                    Clear selection
                  </button>
                  <button type="button" className="btn-outline" onClick={() => setCurrentStep(1)}>
                    Back
                  </button>
                  <button
                    type="button"
                    className="btn-accent"
                    onClick={() => setCurrentStep(3)}
                    disabled={selectedProviderIds.length === 0}
                  >
                    Continue to readiness review
                  </button>
                </div>
              </>
            ) : null}

            {currentStep === 3 ? (
              <>
                <div className="setup-wizard-copy">
                  <strong>Step 3: review readiness</strong>
                  <p>
                    Before saving this starting state, verify that the selected providers have traces, session history, parser coverage, and safe cleanup support.
                  </p>
                </div>
                {selectedCards.length > 0 ? (
                  <div className="setup-wizard-summary-grid">
                    {selectedCards.map((card) => (
                      <article key={card.providerId} className="setup-wizard-summary-card">
                        <div className="setup-wizard-choice-head">
                          <h3>{card.name}</h3>
                          <span className={`status-pill status-${card.status === "missing" ? "missing" : card.status === "active" ? "active" : "detected"}`}>
                            {card.status === "active" ? "Active" : card.status === "detected" ? "Detected" : "Missing"}
                          </span>
                        </div>
                        <div className="setup-wizard-summary-list">
                          <span>Source traces: {card.sourceCount > 0 ? `${card.sourceCount} detected` : "none"}</span>
                          <span>Sessions: {card.sessionCount}</span>
                          <span>Parser score: {card.parseScore === null ? "not scanned yet" : `${card.parseScore}%`}</span>
                          <span>Read access: {card.canRead ? "ready" : "blocked"}</span>
                          <span>Safe cleanup: {card.canSafeCleanup ? "available" : "unavailable"}</span>
                          <span>Analysis: {card.canAnalyze ? "available" : "blocked"}</span>
                        </div>
                        <div className="setup-wizard-actions">
                          <button type="button" className="btn-outline" onClick={() => goToProviders(card.providerId)}>
                            Open {card.name}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <article className="setup-wizard-empty">
                    <strong>No provider is selected yet</strong>
                    <p>Go back one step and choose at least one provider before finishing the wizard.</p>
                  </article>
                )}
                <div className="setup-wizard-actions">
                  <button type="button" className="btn-outline" onClick={() => setCurrentStep(2)}>
                    Back
                  </button>
                  <button type="button" className="btn-outline" onClick={onRefresh} disabled={providersRefreshing}>
                    {providersRefreshing ? "Refreshing..." : "Refresh before saving"}
                  </button>
                  <button
                    type="button"
                    className="btn-accent"
                    onClick={markComplete}
                    disabled={selectedCards.length === 0}
                  >
                    Mark setup complete
                  </button>
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
