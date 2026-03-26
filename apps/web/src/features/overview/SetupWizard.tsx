import { useEffect, useMemo, useState } from "react";
import type {
  DataSourceInventoryRow,
  ProviderMatrixProvider,
  ProviderParserHealthReport,
  ProviderSessionRow,
} from "../../types";

const WIZARD_STEP_STORAGE_KEY = "po-setup-wizard-step";
const WIZARD_SELECTION_STORAGE_KEY = "po-setup-wizard-selection";
const WIZARD_COMPLETED_AT_STORAGE_KEY = "po-setup-wizard-completed-at";

type WizardStep = 1 | 2 | 3;

export type SetupWizardProps = {
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
  const activeProviderCount = providerCards.filter((card) => card.status === "active").length;

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
        <h2>Setup</h2>
        <span>detect / focus / ready</span>
      </header>

      <div className="setup-wizard-shell">
        <section className="setup-wizard-stage">
          <div className="setup-wizard-stage-copy">
            <span className="overview-note-label">setup stage</span>
            <strong>detect / focus / save</strong>
            <p>sources / focus / status</p>
          </div>
          <div className="setup-wizard-stage-pills" aria-label="setup wizard summary">
            <span className="setup-wizard-stage-pill">active · {activeProviderCount}</span>
            <span className="setup-wizard-stage-pill">detected · {detectedSourceCount}</span>
            <span className="setup-wizard-stage-pill">recommended · {recommendedProviderIds.length}</span>
            <span className="setup-wizard-stage-pill">selected · {selectedCards.length || selectedProviderIds.length}</span>
          </div>
          <div className="setup-wizard-stage-summary">
            <article className="setup-wizard-stage-card">
              <span>sources</span>
              <strong>{detectedSourceCount}</strong>
              <p>local traces</p>
            </article>
            <article className="setup-wizard-stage-card">
              <span>focus</span>
              <strong>{selectedCards.length || selectedProviderIds.length}</strong>
              <p>active set</p>
            </article>
            <article className="setup-wizard-stage-card">
              <span>status</span>
              <strong>{completedAt ? "saved" : `step ${currentStepState}`}</strong>
              <p>save state</p>
            </article>
          </div>
        </section>

        <ol className="setup-wizard-steps" aria-label="provider setup steps">
          {[
            {
              step: 1 as WizardStep,
              title: "Detect",
              body: "local traces",
            },
            {
              step: 2 as WizardStep,
              title: "Focus",
              body: "pick ai",
            },
            {
              step: 3 as WizardStep,
              title: "Ready",
              body: "save state",
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
                  <span className={`status-pill status-${state === "done" ? "active" : state === "current" ? "preview" : "missing"}`}>
                    {state === "done" ? "Done" : state === "current" ? "Active" : "Next"}
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
              <strong>focus saved</strong>
              <p>open sessions</p>
            </div>
            <div className="setup-wizard-metric-row">
              <article className="setup-wizard-metric">
                <span>focus</span>
                <strong>{selectedCards.length || selectedProviderIds.length || providerCards.length}</strong>
              </article>
              <article className="setup-wizard-metric">
                <span>traces</span>
                <strong>{detectedSourceCount}</strong>
              </article>
              <article className="setup-wizard-metric">
                <span>saved</span>
                <strong>{formatTimestamp(completedAt)}</strong>
              </article>
            </div>
            <div className="setup-wizard-actions">
              <button type="button" className="btn-accent" onClick={() => goToProviders()}>
                Sessions
              </button>
              <button type="button" className="btn-outline" onClick={() => setExpandedAfterComplete(true)}>
                Reopen
              </button>
            </div>
          </div>
        ) : completedAt ? (
          <div className="setup-wizard-complete">
            <div className="setup-wizard-complete-copy">
              <strong>focus saved</strong>
              <p>{selectedCards.length || selectedProviderIds.length || providerCards.length} providers ready</p>
            </div>
            <div className="setup-wizard-metric-row">
              <article className="setup-wizard-metric">
                <span>Saved</span>
                <strong>{formatTimestamp(completedAt)}</strong>
              </article>
              <article className="setup-wizard-metric">
                <span>Traces</span>
                <strong>{detectedSourceCount}</strong>
              </article>
              <article className="setup-wizard-metric">
                <span>Last refresh</span>
                <strong>{providersLastRefreshAt || "No refresh yet"}</strong>
              </article>
            </div>
            <div className="setup-wizard-actions">
              <button type="button" className="btn-accent" onClick={() => goToProviders()}>
                Sessions
              </button>
              <button type="button" className="btn-outline" onClick={onOpenDiagnostics}>
                Diagnostics
              </button>
              <button type="button" className="btn-outline" onClick={() => setExpandedAfterComplete(false)}>
                Collapse
              </button>
              <button type="button" className="btn-outline" onClick={rerunWizard}>
                Rerun
              </button>
            </div>
          </div>
        ) : (
          <div className="setup-wizard-body">
            {currentStep === 1 ? (
              <>
                <div className="setup-wizard-copy">
                  <strong>Step 1: detect</strong>
                  <p>read sources</p>
                </div>
                <div className="setup-wizard-metric-row">
                  <article className="setup-wizard-metric">
                    <span>Sources</span>
                    <strong>{detectedSourceCount}</strong>
                  </article>
                  <article className="setup-wizard-metric">
                    <span>Providers</span>
                    <strong>{providerCards.length}</strong>
                  </article>
                  <article className="setup-wizard-metric">
                    <span>Last refresh</span>
                    <strong>{providersLastRefreshAt || "No refresh yet"}</strong>
                  </article>
                </div>
                <div className="setup-wizard-actions">
                  <button
                    type="button"
                    className="btn-accent"
                    onClick={onRefresh}
                    disabled={providersRefreshing}
                  >
                    {providersRefreshing ? "Refreshing..." : "Refresh"}
                  </button>
                  <button type="button" className="btn-outline" onClick={() => setCurrentStep(2)}>
                    {detectedSourceCount > 0 ? "Continue" : "Skip detect"}
                  </button>
                  <button type="button" className="btn-outline" onClick={() => goToProviders()}>
                    Sessions
                  </button>
                </div>
              </>
            ) : null}

            {currentStep === 2 ? (
              <>
                <div className="setup-wizard-copy">
                  <strong>Step 2: focus</strong>
                  <p>pick ai</p>
                </div>
                <div className="info-box">
                  <strong>recommended</strong>
                  <p>
                    {recommendedProviderIds.length > 0
                      ? recommendedProviderIds
                          .map((providerId) => providerCards.find((card) => card.providerId === providerId)?.name ?? providerId)
                          .join(", ")
                      : "detect first."}
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
                    Pick recommended
                  </button>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={clearSelection}
                    disabled={selectedProviderIds.length === 0}
                  >
                    Clear
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
                    Continue
                  </button>
                </div>
              </>
            ) : null}

            {currentStep === 3 ? (
              <>
                <div className="setup-wizard-copy">
                  <strong>Step 3: ready</strong>
                  <p>review state</p>
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
                          <span>Traces: {card.sourceCount > 0 ? `${card.sourceCount} detected` : "none"}</span>
                          <span>Sessions: {card.sessionCount}</span>
                          <span>Parser score: {card.parseScore === null ? "not scanned" : `${card.parseScore}%`}</span>
                          <span>Read access: {card.canRead ? "ready" : "blocked"}</span>
                          <span>Safe cleanup: {card.canSafeCleanup ? "ready" : "blocked"}</span>
                          <span>Analyze: {card.canAnalyze ? "ready" : "blocked"}</span>
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
                    <strong>no focus ai</strong>
                    <p>pick one.</p>
                  </article>
                )}
                <div className="setup-wizard-actions">
                  <button type="button" className="btn-outline" onClick={() => setCurrentStep(2)}>
                    Back
                  </button>
                  <button type="button" className="btn-outline" onClick={onRefresh} disabled={providersRefreshing}>
                    {providersRefreshing ? "Refreshing..." : "Refresh"}
                  </button>
                  <button
                    type="button"
                    className="btn-accent"
                    onClick={markComplete}
                    disabled={selectedCards.length === 0}
                  >
                    Mark ready
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
