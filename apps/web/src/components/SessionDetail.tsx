import { useEffect, useRef, useState } from "react";
import type { Messages } from "../i18n";
import type { ProviderSessionRow, TranscriptPayload } from "../types";
import { formatDateTime, formatInteger, normalizeDisplayValue } from "../lib/helpers";
import { TranscriptLog } from "./TranscriptLog";

export interface SessionDetailProps {
  messages: Messages;
  selectedSession: ProviderSessionRow | null;
  sessionTranscriptData: TranscriptPayload | null;
  sessionTranscriptLoading: boolean;
  sessionTranscriptLimit: number;
  setSessionTranscriptLimit: React.Dispatch<React.SetStateAction<number>>;
  busy: boolean;
  canRunSessionAction: boolean;
  providerDeleteBackupEnabled: boolean;
  setProviderDeleteBackupEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  runSingleProviderAction: (
    provider: string,
    filePath: string,
    action: "backup_local" | "archive_local" | "delete_local",
    dryRun: boolean,
    options?: { backup_before_delete?: boolean },
  ) => void;
}

export function SessionDetail(props: SessionDetailProps) {
  const {
    messages,
    selectedSession,
    sessionTranscriptData,
    sessionTranscriptLoading,
    sessionTranscriptLimit,
    setSessionTranscriptLimit,
    busy,
    canRunSessionAction,
    providerDeleteBackupEnabled,
    setProviderDeleteBackupEnabled,
    runSingleProviderAction,
  } = props;
  const [copyNotice, setCopyNotice] = useState("");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const desktopBridge =
    typeof window !== "undefined" ? window.providerObservatoryDesktop : undefined;
  const isElectronRuntime = desktopBridge?.runtime === "electron";

  useEffect(() => {
    if (!copyNotice) return;
    const timer = window.setTimeout(() => setCopyNotice(""), 1400);
    return () => window.clearTimeout(timer);
  }, [copyNotice]);

  useEffect(() => {
    if (!bodyRef.current) return;
    bodyRef.current.scrollTop = 0;
  }, [selectedSession?.file_path]);

  const copyText = async (text: string, label: string) => {
    const value = String(text ?? "").trim();
    if (!value) return;
    try {
      if (window?.navigator?.clipboard?.writeText) {
        await window.navigator.clipboard.writeText(value);
      } else {
        const input = document.createElement("textarea");
        input.value = value;
        input.style.position = "fixed";
        input.style.left = "-9999px";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setCopyNotice(`${label} ${messages.sessionDetail.copied}`);
    } catch {
      setCopyNotice(`${messages.errors.providerAction}`);
    }
  };

  const runDesktopAction = async (
    action: "reveal" | "open" | "preview",
    label: string,
  ) => {
    if (!selectedSession || !desktopBridge) return;

    const actionMap = {
      reveal: desktopBridge.revealPath,
      open: desktopBridge.openPath,
      preview: desktopBridge.previewPath,
    } as const;
    const handler = actionMap[action];

    if (!handler) {
      setCopyNotice(messages.sessionDetail.desktopUnavailable);
      return;
    }

    const result = await handler(selectedSession.file_path);
    if (!result?.ok) {
      setCopyNotice(result?.error || messages.sessionDetail.desktopUnavailable);
      return;
    }

    if (action === "reveal") {
      setCopyNotice(messages.sessionDetail.revealSuccess);
      return;
    }
    if (action === "preview") {
      setCopyNotice(messages.sessionDetail.previewSuccess);
      return;
    }
    setCopyNotice(`${label} ${messages.sessionDetail.desktopActionReady}`);
  };

  const openDesktopWindow = async () => {
    if (!selectedSession || !desktopBridge?.openWorkbenchWindow) {
      setCopyNotice(messages.sessionDetail.desktopUnavailable);
      return;
    }

    const result = await desktopBridge.openWorkbenchWindow({
      view: "providers",
      provider: selectedSession.provider,
      filePath: selectedSession.file_path,
    });

    if (!result?.ok) {
      setCopyNotice(result?.error || messages.sessionDetail.desktopUnavailable);
      return;
    }

    setCopyNotice(messages.sessionDetail.newWindowSuccess);
  };

  const emptyTranscriptLabel = (() => {
    if (!selectedSession) return messages.sessionDetail.emptyTranscript;
    if ((sessionTranscriptData?.message_count ?? 0) === 0 && selectedSession.provider === "chatgpt") {
      return "이 ChatGPT Desktop 파일은 바이너리나 메타데이터 캐시라서 전사를 직접 펼칠 수 없어. 감지와 기본 세션 정보까지만 확인할 수 있고 전체 대화 본문은 열리지 않아.";
    }
    if (
      (sessionTranscriptData?.message_count ?? 0) === 0 &&
      selectedSession.provider === "copilot" &&
      selectedSession.probe.format === "json"
    ) {
      return "이 Copilot 세션 JSON은 구조상으로는 파싱됐지만 실제 대화 메시지가 비어 있어. 전체 전사를 보려면 다른 workspace chat 행을 열어봐.";
    }
    if (selectedSession.probe.format === "unknown") {
      return "이 파일 형식은 아직 직접 전사를 열 수 없어. 로컬 캐시나 바이너리 메타데이터만 감지됐어.";
    }
    if (selectedSession.file_path.endsWith(".metadata.json")) {
      return "이 행은 세션 메타데이터야. 전사를 열려면 아래의 실제 chatSessions JSON 행을 골라.";
    }
    return messages.sessionDetail.emptyTranscript;
  })();
  const sessionModelHint = (() => {
    if (!selectedSession) return "";
    if (selectedSession.provider === "codex") {
      return "Codex 원본 세션 rail.";
    }
    if (selectedSession.provider === "claude") {
      return "Claude 원본 세션 rail.";
    }
    if (selectedSession.provider === "gemini") {
      return "Gemini 원본 세션 rail.";
    }
    if (selectedSession.provider === "copilot") {
      return "Copilot 원본 세션 rail.";
    }
    return "선택한 세션 rail.";
  })();
  const compactToken = (value: string) =>
    value && value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
  const derivedSessionToken =
    selectedSession?.file_path.match(/[0-9a-f]{8}-[0-9a-f-]{9,}/i)?.[0] ?? "";
  const fallbackSessionTitle = derivedSessionToken
    ? `session ${derivedSessionToken.slice(0, 8)}`
    : messages.threadDetail.unknownTitle;
  const sessionDisplayTitle =
    normalizeDisplayValue(selectedSession?.display_title) ||
    normalizeDisplayValue(selectedSession?.probe.detected_title) ||
    fallbackSessionTitle;
  const sessionProbeLabel = selectedSession
    ? `${selectedSession.probe.format} / ${selectedSession.probe.ok ? messages.common.ok : messages.common.fail}`
    : "";

  return (
    <section className="panel session-detail-panel">
      <header>
        <h2>{messages.sessionDetail.title}</h2>
        <span>{selectedSession ? selectedSession.provider : messages.common.none}</span>
      </header>
      <div ref={bodyRef} className="impact-body">
        {!selectedSession ? (
          <div className="session-detail-empty-state">
            <div className="session-detail-empty-copy">
              <span className="overview-note-label">{messages.sessionDetail.title}</span>
              <strong>세션을 고르면 열린다.</strong>
              <p>전사와 보호 액션을 여기서 본다.</p>
            </div>
          </div>
        ) : (
          <>
            <section className="detail-hero detail-hero-session">
              <div className="detail-hero-copy">
                <span className="overview-note-label">original session rail</span>
                <strong>{sessionDisplayTitle}</strong>
                <p>{sessionModelHint}</p>
              </div>
              <div className="detail-hero-pills" aria-label="session detail summary">
                <span className="detail-hero-pill">{selectedSession.provider}</span>
                {derivedSessionToken ? <span className="detail-hero-pill mono-sub">{compactToken(derivedSessionToken)}</span> : null}
                <span className="detail-hero-pill">{sessionProbeLabel}</span>
              </div>
            </section>
            {isElectronRuntime ? (
              <section className="detail-section detail-section-desktop-quick-actions detail-section-static">
                <div className="detail-section-static-head">{messages.sessionDetail.desktopQuickActions}</div>
                <div className="detail-section-body">
                  <div className="chat-toolbar detail-action-bar detail-action-bar-compact detail-action-bar-desktop">
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => void runDesktopAction("reveal", messages.sessionDetail.revealInFinder)}
                    >
                      {messages.sessionDetail.revealInFinder}
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => void runDesktopAction("preview", messages.sessionDetail.previewFile)}
                    >
                      {messages.sessionDetail.previewFile}
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => void openDesktopWindow()}
                    >
                      {messages.sessionDetail.openInNewWindow}
                    </button>
                  </div>
                </div>
              </section>
            ) : null}
            <section className="detail-section detail-section-transcript detail-section-static">
              <div className="detail-section-static-head">{messages.sessionDetail.sectionTranscript}</div>
              <div className="detail-section-body">
                <TranscriptLog
                  messages={messages}
                  transcript={sessionTranscriptData?.messages ?? []}
                  loading={sessionTranscriptLoading}
                  truncated={sessionTranscriptData?.truncated ?? false}
                  messageCount={sessionTranscriptData?.message_count ?? 0}
                  limit={sessionTranscriptLimit}
                  maxLimit={10_000}
                  initialVisibleCount={10}
                  visibleStep={10}
                  emptyLabel={emptyTranscriptLabel}
                  onLoadMore={() => setSessionTranscriptLimit((prev) => Math.min(prev + 120, 10_000))}
                />
              </div>
            </section>
            <div className="session-detail-top-grid">
              <details className="detail-section">
                <summary>{messages.sessionDetail.sectionOverview}</summary>
                <div className="detail-section-body">
                <div className="info-box compact">
                  <strong>{messages.sessionDetail.modelTitle}</strong>
                  <p>{selectedSession.provider}</p>
                </div>
                  <div className="impact-kv">
                    <span>{messages.sessionDetail.fieldTitle}</span>
                    <strong className="title-main">
                      {sessionDisplayTitle || "-"}
                    </strong>
                  </div>
                  <div className="impact-kv">
                    <span>{messages.sessionDetail.fieldTitleSource}</span>
                    <strong>{normalizeDisplayValue(selectedSession.probe.title_source) || "-"}</strong>
                  </div>
                  <div className="impact-kv">
                    <span>{messages.sessionDetail.fieldSessionId}</span>
                    <strong className="mono-sub">{selectedSession.session_id}</strong>
                  </div>
                  <div className="impact-kv">
                    <span>{messages.sessionDetail.fieldProvider}</span>
                    <strong>{selectedSession.provider}</strong>
                  </div>
                  <div className="impact-kv">
                    <span>{messages.sessionDetail.fieldSource}</span>
                    <strong>{normalizeDisplayValue(selectedSession.source) || "-"}</strong>
                  </div>
                  <div className="impact-kv">
                    <span>{messages.sessionDetail.fieldFormatProbe}</span>
                    <strong>
                      {selectedSession.probe.format} / {selectedSession.probe.ok ? messages.common.ok : messages.common.fail}
                    </strong>
                  </div>
                  <div className="impact-kv">
                    <span>{messages.sessionDetail.fieldSize}</span>
                    <strong>{formatInteger(selectedSession.size_bytes)}</strong>
                  </div>
                  <div className="impact-kv">
                    <span>{messages.sessionDetail.fieldModified}</span>
                    <strong>{formatDateTime(selectedSession.mtime)}</strong>
                  </div>
                </div>
              </details>
            </div>
            <details className="detail-section detail-section-actions">
              <summary>{messages.sessionDetail.sectionActions}</summary>
              <div className="detail-section-body">
                <div className="impact-kv">
                  <span>{messages.sessionDetail.fieldPath}</span>
                  <strong className="mono-sub">{selectedSession.file_path}</strong>
                </div>
                <div className="info-box compact">
                  <p>{messages.sessionDetail.rawActionHint}</p>
                </div>
                <div className="chat-toolbar detail-action-bar detail-action-bar-compact">
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() =>
                      copyText(
                        normalizeDisplayValue(selectedSession.display_title) ||
                          normalizeDisplayValue(selectedSession.probe.detected_title) ||
                          "",
                        messages.sessionDetail.copyTitle,
                      )
                    }
                  >
                    {messages.sessionDetail.copyTitle}
                  </button>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => copyText(selectedSession.session_id, messages.sessionDetail.copyId)}
                  >
                    {messages.sessionDetail.copyId}
                  </button>
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => copyText(selectedSession.file_path, messages.sessionDetail.copyPath)}
                  >
                    {messages.sessionDetail.copyPath}
                  </button>
                </div>
                {isElectronRuntime ? (
                  <div className="chat-toolbar detail-action-bar detail-action-bar-compact detail-action-bar-desktop">
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => void runDesktopAction("reveal", messages.sessionDetail.revealInFinder)}
                    >
                      {messages.sessionDetail.revealInFinder}
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => void runDesktopAction("open", messages.sessionDetail.openFile)}
                    >
                      {messages.sessionDetail.openFile}
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => void runDesktopAction("preview", messages.sessionDetail.previewFile)}
                    >
                      {messages.sessionDetail.previewFile}
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => void openDesktopWindow()}
                    >
                      {messages.sessionDetail.openInNewWindow}
                    </button>
                  </div>
                ) : null}
                {copyNotice ? <p className="sub-hint">{copyNotice}</p> : null}
                <div className="detail-actions-primary">
                  <label className="check-inline">
                    <input
                      type="checkbox"
                      checked={providerDeleteBackupEnabled}
                      onChange={(event) => setProviderDeleteBackupEnabled(event.target.checked)}
                    />
                    {messages.sessionDetail.deleteWithBackup}
                  </label>
                  <div className="chat-toolbar detail-action-bar">
                    <button
                      type="button"
                      className="btn-base"
                      onClick={() =>
                        runSingleProviderAction(
                          selectedSession.provider,
                          selectedSession.file_path,
                          "backup_local",
                          false,
                        )
                      }
                      disabled={busy || !selectedSession}
                    >
                      {messages.sessionDetail.backup}
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() =>
                        runSingleProviderAction(
                          selectedSession.provider,
                          selectedSession.file_path,
                          "archive_local",
                          true,
                        )
                      }
                      disabled={busy || !canRunSessionAction}
                    >
                      {messages.sessionDetail.archiveDryRun}
                    </button>
                    <button
                      type="button"
                      className="btn-base"
                      onClick={() =>
                        runSingleProviderAction(
                          selectedSession.provider,
                          selectedSession.file_path,
                          "archive_local",
                          false,
                        )
                      }
                      disabled={busy || !canRunSessionAction}
                    >
                      {messages.sessionDetail.archive}
                    </button>
                  </div>
                </div>
                <div className="danger-zone">
                <div className="danger-zone-head">
                  <span className="overview-note-label">위험 구역</span>
                  <strong>삭제는 마지막.</strong>
                </div>
                  <div className="chat-toolbar detail-action-bar detail-action-bar-danger">
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() =>
                        runSingleProviderAction(
                          selectedSession.provider,
                          selectedSession.file_path,
                          "delete_local",
                          true,
                          { backup_before_delete: providerDeleteBackupEnabled },
                        )
                      }
                      disabled={busy || !canRunSessionAction}
                    >
                      {messages.sessionDetail.deleteDryRun}
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      onClick={() =>
                        runSingleProviderAction(
                          selectedSession.provider,
                          selectedSession.file_path,
                          "delete_local",
                          false,
                          { backup_before_delete: providerDeleteBackupEnabled },
                        )
                      }
                      disabled={busy || !canRunSessionAction}
                    >
                      {messages.sessionDetail.delete}
                    </button>
                  </div>
                </div>
                <p className="sub-hint">
                  {providerDeleteBackupEnabled
                    ? messages.sessionDetail.deleteWithBackupHint
                    : messages.sessionDetail.rawActionHint}
                </p>
                {!canRunSessionAction ? (
                  <p className="sub-hint">{messages.sessionDetail.readOnlyHint}</p>
                ) : null}
              </div>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
