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
        <h2>프로바이더 설정 도우미</h2>
        <span>로컬 흔적을 감지하고, 집중할 프로바이더를 고른 뒤, 깔끔한 시작 상태를 저장해.</span>
      </header>

      <div className="setup-wizard-shell">
        <ol className="setup-wizard-steps" aria-label="프로바이더 설정 단계">
          {[
            {
              step: 1 as WizardStep,
              title: "로컬 흔적 감지",
              body: "무엇에 집중할지 고르기 전에 로컬 루트와 캐시 활동을 새로고침해.",
            },
            {
              step: 2 as WizardStep,
              title: "집중 프로바이더 선택",
              body: "이 대시보드가 우선으로 다룰 프로바이더를 골라.",
            },
            {
              step: 3 as WizardStep,
              title: "준비 상태 검토",
              body: "소스 커버리지, 세션 수, 안전 정리 가능 여부를 확인해.",
            },
          ].map((item) => {
            const state = stepState(currentStepState, item.step, Boolean(completedAt));
            return (
              <li
                key={item.step}
                className={`setup-wizard-step setup-wizard-step-${state}`}
              >
                <div className="setup-wizard-step-top">
                  <span className="setup-wizard-step-index">단계 {item.step}</span>
                  <span className={`status-pill status-${state === "done" ? "active" : state === "current" ? "detected" : "missing"}`}>
                    {state === "done" ? "완료" : state === "current" ? "진행 중" : "예정"}
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
              <strong>초기 설정이 끝났어</strong>
              <p>
                이 도우미를 계속 열어둘 필요는 없어. 필요할 때만 다시 열고, 평소엔 바로 작업이나 검색으로 가면 돼.
              </p>
            </div>
            <div className="setup-wizard-metric-row">
              <article className="setup-wizard-metric">
                <span>집중 AI</span>
                <strong>{selectedCards.length || selectedProviderIds.length || providerCards.length}</strong>
              </article>
              <article className="setup-wizard-metric">
                <span>감지된 흔적</span>
                <strong>{detectedSourceCount}</strong>
              </article>
              <article className="setup-wizard-metric">
                <span>마지막 저장</span>
                <strong>{formatTimestamp(completedAt)}</strong>
              </article>
            </div>
            <div className="setup-wizard-actions">
              <button type="button" className="btn-accent" onClick={() => goToProviders()}>
                세션 화면 열기
              </button>
              <button type="button" className="btn-outline" onClick={() => setExpandedAfterComplete(true)}>
                도우미 다시 열기
              </button>
            </div>
          </div>
        ) : completedAt ? (
          <div className="setup-wizard-complete">
            <div className="setup-wizard-complete-copy">
              <strong>설정을 저장했어</strong>
              <p>
                {selectedCards.length || selectedProviderIds.length || providerCards.length}개 프로바이더 기준의 집중 화면을 저장했어.
              </p>
            </div>
            <div className="setup-wizard-metric-row">
              <article className="setup-wizard-metric">
                <span>완료 시각</span>
                <strong>{formatTimestamp(completedAt)}</strong>
              </article>
              <article className="setup-wizard-metric">
                <span>감지된 흔적</span>
                <strong>{detectedSourceCount}</strong>
              </article>
              <article className="setup-wizard-metric">
                <span>마지막 새로고침</span>
                <strong>{providersLastRefreshAt || "아직 새로고침 안 함"}</strong>
              </article>
            </div>
            <div className="setup-wizard-actions">
              <button type="button" className="btn-accent" onClick={() => goToProviders()}>
                세션 화면 열기
              </button>
              <button type="button" className="btn-outline" onClick={onOpenDiagnostics}>
                AI 진단 열기
              </button>
              <button type="button" className="btn-outline" onClick={() => setExpandedAfterComplete(false)}>
                접기
              </button>
              <button type="button" className="btn-outline" onClick={rerunWizard}>
                도우미 다시 실행
              </button>
            </div>
          </div>
        ) : (
          <div className="setup-wizard-body">
            {currentStep === 1 ? (
              <>
                <div className="setup-wizard-copy">
                  <strong>1단계: 로컬 프로바이더 흔적 감지</strong>
                  <p>
                    도우미가 실제 설치되어 있고 이미 세션 로그를 만들고 있는 프로바이더를 추천할 수 있게 먼저 로컬 데이터 소스를 새로고침해.
                  </p>
                </div>
                <div className="setup-wizard-metric-row">
                  <article className="setup-wizard-metric">
                    <span>감지된 소스</span>
                    <strong>{detectedSourceCount}</strong>
                  </article>
                  <article className="setup-wizard-metric">
                    <span>알려진 프로바이더</span>
                    <strong>{providerCards.length}</strong>
                  </article>
                  <article className="setup-wizard-metric">
                    <span>마지막 새로고침</span>
                    <strong>{providersLastRefreshAt || "아직 새로고침 안 함"}</strong>
                  </article>
                </div>
                <div className="setup-wizard-actions">
                  <button
                    type="button"
                    className="btn-accent"
                    onClick={onRefresh}
                    disabled={providersRefreshing}
                  >
                    {providersRefreshing ? "새로고침 중..." : "감지 새로고침"}
                  </button>
                  <button type="button" className="btn-outline" onClick={() => setCurrentStep(2)}>
                    {detectedSourceCount > 0 ? "감지된 소스로 계속" : "감지 없이 계속"}
                  </button>
                  <button type="button" className="btn-outline" onClick={() => goToProviders()}>
                    세션 화면 열기
                  </button>
                </div>
              </>
            ) : null}

            {currentStep === 2 ? (
              <>
                <div className="setup-wizard-copy">
                  <strong>2단계: 집중 프로바이더 선택</strong>
                  <p>
                    지금 중요하게 볼 프로바이더를 골라. 여기서 삭제는 일어나지 않고, 어떤 프로바이더를 먼저 강조할지만 저장해.
                  </p>
                  <p>
                    추천 프로바이더는 참고용으로만 보여줘. 자동 선택은 없고, 네가 직접 고른 것만 저장돼.
                  </p>
                </div>
                <div className="info-box">
                  <strong>추천 대상</strong>
                  <p>
                    {recommendedProviderIds.length > 0
                      ? recommendedProviderIds
                          .map((providerId) => providerCards.find((card) => card.providerId === providerId)?.name ?? providerId)
                          .join(", ")
                      : "아직 추천이 준비되지 않았어. 먼저 1단계에서 감지를 새로고침해."}
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
                            {card.status === "active" ? "활성" : card.status === "detected" ? "감지됨" : "없음"}
                          </span>
                        </div>
                        <div className="setup-wizard-choice-meta">
                          <span>{card.sourceCount}개 흔적</span>
                          <span>{card.sessionCount}개 세션</span>
                          <span>{card.rootCount}개 루트</span>
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
                    추천 AI만 선택
                  </button>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={clearSelection}
                    disabled={selectedProviderIds.length === 0}
                  >
                    선택 비우기
                  </button>
                  <button type="button" className="btn-outline" onClick={() => setCurrentStep(1)}>
                    뒤로
                  </button>
                  <button
                    type="button"
                    className="btn-accent"
                    onClick={() => setCurrentStep(3)}
                    disabled={selectedProviderIds.length === 0}
                  >
                    준비 상태 검토로 계속
                  </button>
                </div>
              </>
            ) : null}

            {currentStep === 3 ? (
              <>
                <div className="setup-wizard-copy">
                  <strong>3단계: 준비 상태 검토</strong>
                  <p>
                    이 시작 상태를 저장하기 전에, 선택한 프로바이더에 흔적, 세션 이력, 파서 커버리지, 안전 정리 지원이 있는지 확인해.
                  </p>
                </div>
                {selectedCards.length > 0 ? (
                  <div className="setup-wizard-summary-grid">
                    {selectedCards.map((card) => (
                      <article key={card.providerId} className="setup-wizard-summary-card">
                        <div className="setup-wizard-choice-head">
                          <h3>{card.name}</h3>
                          <span className={`status-pill status-${card.status === "missing" ? "missing" : card.status === "active" ? "active" : "detected"}`}>
                            {card.status === "active" ? "활성" : card.status === "detected" ? "감지됨" : "없음"}
                          </span>
                        </div>
                        <div className="setup-wizard-summary-list">
                          <span>소스 흔적: {card.sourceCount > 0 ? `${card.sourceCount}개 감지` : "없음"}</span>
                          <span>세션: {card.sessionCount}</span>
                          <span>파서 점수: {card.parseScore === null ? "아직 스캔 안 함" : `${card.parseScore}%`}</span>
                          <span>읽기 접근: {card.canRead ? "준비됨" : "차단됨"}</span>
                          <span>안전 정리: {card.canSafeCleanup ? "가능" : "불가"}</span>
                          <span>분석: {card.canAnalyze ? "가능" : "차단됨"}</span>
                        </div>
                        <div className="setup-wizard-actions">
                          <button type="button" className="btn-outline" onClick={() => goToProviders(card.providerId)}>
                            {card.name} 열기
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <article className="setup-wizard-empty">
                    <strong>아직 선택된 프로바이더가 없어</strong>
                    <p>한 단계 뒤로 가서 적어도 하나의 프로바이더를 고른 뒤 마무리해.</p>
                  </article>
                )}
                <div className="setup-wizard-actions">
                  <button type="button" className="btn-outline" onClick={() => setCurrentStep(2)}>
                    뒤로
                  </button>
                  <button type="button" className="btn-outline" onClick={onRefresh} disabled={providersRefreshing}>
                    {providersRefreshing ? "새로고침 중..." : "저장 전 새로고침"}
                  </button>
                  <button
                    type="button"
                    className="btn-accent"
                    onClick={markComplete}
                    disabled={selectedCards.length === 0}
                  >
                    설정 완료로 표시
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
