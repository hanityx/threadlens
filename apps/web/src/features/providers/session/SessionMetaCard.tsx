import type { Messages } from "@/i18n";
import type { ProviderSessionRow } from "@/shared/types";

export function SessionMetaCard(props: {
  messages: Messages;
  session: ProviderSessionRow;
  title: string;
  formatBytes: (value: number) => string;
  formatDateTime: (value: string) => string;
  normalizeDisplayValue: (value: unknown) => string;
}) {
  const { messages, session, title, formatBytes, formatDateTime, normalizeDisplayValue } = props;

  return (
    <details className="detail-section session-detail-overview-section">
      <summary>{messages.sessionDetail.sectionOverview}</summary>
      <div className="detail-section-body">
        <div className="session-overview-grid">
          <div className="impact-kv session-overview-kv session-overview-kv-wide">
            <span>{messages.sessionDetail.fieldTitle}</span>
            <strong className="title-main">{title || "-"}</strong>
          </div>
          <div className="impact-kv session-overview-kv">
            <span>{messages.sessionDetail.fieldTitleSource}</span>
            <strong>{normalizeDisplayValue(session.probe.title_source) || "-"}</strong>
          </div>
          <div className="impact-kv session-overview-kv">
            <span>{messages.sessionDetail.fieldSource}</span>
            <strong>{normalizeDisplayValue(session.source) || "-"}</strong>
          </div>
          <div className="impact-kv session-overview-kv session-overview-kv-wide">
            <span>{messages.sessionDetail.fieldSessionId}</span>
            <strong className="mono-sub">{session.session_id}</strong>
          </div>
          <div className="impact-kv session-overview-kv session-overview-kv-wide">
            <span>{messages.sessionDetail.fieldPath}</span>
            <strong className="mono-sub">{session.file_path}</strong>
          </div>
          <div className="impact-kv session-overview-kv">
            <span>{messages.sessionDetail.fieldSize}</span>
            <strong>{formatBytes(session.size_bytes)}</strong>
          </div>
          <div className="impact-kv session-overview-kv">
            <span>{messages.sessionDetail.fieldModified}</span>
            <strong>{formatDateTime(session.mtime)}</strong>
          </div>
        </div>
      </div>
    </details>
  );
}
