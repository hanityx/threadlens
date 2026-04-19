import type { Messages } from "@/i18n";

export function SessionEmptyState(props: {
  messages: Messages;
  emptyNextSessions: Array<{
    title: string;
    path?: string;
    description?: string;
  }>;
  emptyScopeLabel: string;
  onOpenSessionPath?: (path: string) => void;
}) {
  const { messages, emptyNextSessions, emptyScopeLabel, onOpenSessionPath } = props;

  return (
    <div className="session-detail-empty-state">
      {emptyNextSessions.length > 0 ? (
        <div className="session-detail-empty-grid">
          {emptyNextSessions.map((item, index) =>
            item.path && onOpenSessionPath ? (
              <button
                key={`${item.path}-${index}`}
                type="button"
                className="session-detail-empty-next session-detail-empty-next-button"
                onClick={() => onOpenSessionPath(item.path!)}
              >
                <strong>{item.title}</strong>
                <p>{item.description || `${emptyScopeLabel} ${messages.sessionDetail.emptyNextBody}`}</p>
              </button>
            ) : (
              <div key={`${item.title}-${index}`} className="session-detail-empty-next">
                <strong>{item.title}</strong>
                <p>{item.description || `${emptyScopeLabel} ${messages.sessionDetail.emptyNextBody}`}</p>
              </div>
            ),
          )}
        </div>
      ) : null}
      <p className="session-detail-empty-opens">
        <span className="overview-note-label">{messages.sessionDetail.emptyOpensHereLabel}</span>
        {messages.sessionDetail.emptyOpensHereBody}
      </p>
    </div>
  );
}
