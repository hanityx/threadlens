import { memo, useEffect } from "react";
import type { Messages } from "@/i18n";

type ErrorStateLike = { isError?: boolean };

const THREADLENS_ISSUE_URL = "https://github.com/hanityx/threadlens/issues/new/choose";
let hasLoggedIssueHint = false;

export type RuntimeFeedbackStackProps = {
  messages: Messages;
  hasGlobalErrorStack: boolean;
  runtime: ErrorStateLike;
  smokeStatus: ErrorStateLike;
  recovery: ErrorStateLike;
  providerMatrix: ErrorStateLike;
  providerSessions: ErrorStateLike;
  providerParserHealth: ErrorStateLike;
  showGlobalAnalyzeDeleteError: boolean;
  analyzeDeleteErrorMessage: string;
  showGlobalCleanupDryRunError: boolean;
  cleanupDryRunErrorMessage: string;
  providerSessionActionError: unknown;
  providerSessionActionErrorMessage: string;
  bulkActionError: unknown;
  bulkActionErrorMessage: string;
  showRuntimeBackendDegraded: boolean;
  busy: boolean;
};

export const RuntimeFeedbackStack = memo(function RuntimeFeedbackStack(
  {
    messages,
    hasGlobalErrorStack,
    runtime,
    smokeStatus,
    recovery,
    providerMatrix,
    providerSessions,
    providerParserHealth,
    showGlobalAnalyzeDeleteError,
    analyzeDeleteErrorMessage,
    showGlobalCleanupDryRunError,
    cleanupDryRunErrorMessage,
    providerSessionActionError,
    providerSessionActionErrorMessage,
    bulkActionError,
    bulkActionErrorMessage,
    showRuntimeBackendDegraded,
    busy,
  }: RuntimeFeedbackStackProps,
) {
  useEffect(() => {
    if (!hasGlobalErrorStack || hasLoggedIssueHint) return;
    hasLoggedIssueHint = true;
    console.info(`ThreadLens: runtime issue visible. Open an issue if this looks wrong: ${THREADLENS_ISSUE_URL}`);
  }, [hasGlobalErrorStack]);

  return (
    <>
      {hasGlobalErrorStack ? (
        <section className="error-stack" aria-live="polite">
          <div className="error-stack-head">
            <span className="overview-note-label">{messages.alerts.runtimeIssuesTitle}</span>
            <strong>{messages.alerts.runtimeIssuesBody}</strong>
            <div className="error-stack-actions">
              <a href={THREADLENS_ISSUE_URL} target="_blank" rel="noreferrer">
                {messages.alerts.reportIssue}
              </a>
              <span>{messages.alerts.reportIssuePrivacy}</span>
            </div>
          </div>
          <div className="error-stack-list">
            {runtime.isError ? <div className="error-box">{messages.errors.runtime}</div> : null}
            {smokeStatus.isError ? <div className="error-box">{messages.errors.smokeStatus}</div> : null}
            {recovery.isError ? <div className="error-box">{messages.errors.recovery}</div> : null}
            {providerMatrix.isError ? <div className="error-box">{messages.errors.providerMatrix}</div> : null}
            {providerSessions.isError ? <div className="error-box">{messages.errors.providerSessions}</div> : null}
            {providerParserHealth.isError ? <div className="error-box">{messages.errors.parserHealth}</div> : null}
            {showGlobalAnalyzeDeleteError ? (
              <div className="error-box">
                <div>{messages.errors.impactAnalysis}</div>
                {analyzeDeleteErrorMessage ? <div className="mono-sub">{analyzeDeleteErrorMessage}</div> : null}
              </div>
            ) : null}
            {showGlobalCleanupDryRunError ? (
              <div className="error-box">
                <div>{messages.errors.cleanupDryRun}</div>
                {cleanupDryRunErrorMessage ? <div className="mono-sub">{cleanupDryRunErrorMessage}</div> : null}
              </div>
            ) : null}
            {Boolean(providerSessionActionError) ? (
              <div className="error-box">
                <div>{messages.errors.providerAction}</div>
                {providerSessionActionErrorMessage ? <div className="mono-sub">{providerSessionActionErrorMessage}</div> : null}
              </div>
            ) : null}
            {bulkActionError && !showRuntimeBackendDegraded ? (
              <div className="error-box">
                <div>{messages.errors.threadAction}</div>
                {bulkActionErrorMessage ? <div className="mono-sub">{bulkActionErrorMessage}</div> : null}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
      {busy ? <div className="busy-indicator">{messages.busy}</div> : null}
    </>
  );
});
