import type { Messages } from "../i18n";

type RuntimeFeedbackStackProps = {
  messages: Messages;
  hasGlobalErrorStack: boolean;
  runtimeError: boolean;
  smokeStatusError: boolean;
  recoveryError: boolean;
  providerMatrixError: boolean;
  providerSessionsError: boolean;
  providerParserHealthError: boolean;
  showGlobalAnalyzeDeleteError: boolean;
  analyzeDeleteErrorMessage: string;
  showGlobalCleanupDryRunError: boolean;
  cleanupDryRunErrorMessage: string;
  providerSessionActionError: boolean;
  providerSessionActionErrorMessage: string;
  bulkActionError: boolean;
  bulkActionErrorMessage: string;
  showRuntimeBackendDegraded: boolean;
  busy: boolean;
};

export function RuntimeFeedbackStack(props: RuntimeFeedbackStackProps) {
  const {
    messages,
    hasGlobalErrorStack,
    runtimeError,
    smokeStatusError,
    recoveryError,
    providerMatrixError,
    providerSessionsError,
    providerParserHealthError,
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
  } = props;

  return (
    <>
      {hasGlobalErrorStack ? (
        <section className="error-stack" aria-live="polite">
          <div className="error-stack-head">
            <span className="overview-note-label">runtime issues</span>
            <strong>Some runtime actions are blocked.</strong>
          </div>
          <div className="error-stack-list">
            {runtimeError ? <div className="error-box">{messages.errors.runtime}</div> : null}
            {smokeStatusError ? <div className="error-box">{messages.errors.smokeStatus}</div> : null}
            {recoveryError ? <div className="error-box">{messages.errors.recovery}</div> : null}
            {providerMatrixError ? <div className="error-box">{messages.errors.providerMatrix}</div> : null}
            {providerSessionsError ? <div className="error-box">{messages.errors.providerSessions}</div> : null}
            {providerParserHealthError ? <div className="error-box">{messages.errors.parserHealth}</div> : null}
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
            {providerSessionActionError ? (
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
}
