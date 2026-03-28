import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { Messages } from "../i18n";
import { formatDateTime } from "../lib/helpers";

type TranscriptMessage = {
  idx: number;
  role: "user" | "assistant" | "developer" | "system" | "tool" | "unknown";
  text: string;
  ts: string | null;
  source_type: string;
};

type Props = {
  messages: Messages;
  transcript: TranscriptMessage[];
  loading: boolean;
  truncated: boolean;
  messageCount: number;
  limit: number;
  maxLimit?: number;
  initialVisibleCount?: number;
  visibleStep?: number;
  emptyLabel?: string;
  onLoadMore: () => void;
};

type RoleFilter = TranscriptMessage["role"] | "all" | "dialog";

const COLLAPSE_THRESHOLD = 600;

function ChatMessage({
  msg,
  roleLabel,
}: {
  msg: TranscriptMessage;
  roleLabel: (role: TranscriptMessage["role"]) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const pRef = useRef<HTMLParagraphElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = pRef.current;
    if (!el) return;
    setOverflows(el.scrollHeight > COLLAPSE_THRESHOLD);
  }, [msg.text]);

  return (
    <article className={`chat-item role-${msg.role}`}>
      <header>
        <strong>{roleLabel(msg.role)}</strong>
        <span>{msg.ts ? formatDateTime(msg.ts) : msg.source_type}</span>
      </header>
      <p ref={pRef} className={expanded ? "chat-text-expanded" : undefined}>
        {msg.text}
      </p>
      {overflows ? (
        <button
          type="button"
          className="chat-expand-btn"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded ? "▲ collapse" : "▼ show full message"}
        </button>
      ) : null}
    </article>
  );
}

export function TranscriptLog({
  messages,
  transcript,
  loading,
  truncated,
  messageCount,
  limit,
  maxLimit = 10_000,
  initialVisibleCount = 24,
  visibleStep = 24,
  emptyLabel,
  onLoadMore,
}: Props) {
  const [searchInput, setSearchInput] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("dialog");
  const [visibleCount, setVisibleCount] = useState(initialVisibleCount);
  const deferredSearch = useDeferredValue(searchInput);
  const resolvedEmptyLabel = emptyLabel ?? messages.transcript.empty;

  const roleLabel = (role: TranscriptMessage["role"]) => {
    if (role === "user") return messages.transcript.roleUser;
    if (role === "assistant") return messages.transcript.roleAssistant;
    if (role === "developer") return messages.transcript.roleDeveloper;
    if (role === "system") return messages.transcript.roleSystem;
    if (role === "tool") return messages.transcript.roleTool;
    return messages.transcript.roleUnknown;
  };

  const filteredTranscript = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return transcript.filter((msg) => {
      if (roleFilter === "dialog" && msg.role !== "user" && msg.role !== "assistant") return false;
      if (roleFilter !== "all" && roleFilter !== "dialog" && msg.role !== roleFilter) return false;
      if (!q) return true;
      const text = `${msg.text ?? ""} ${msg.source_type ?? ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [transcript, deferredSearch, roleFilter]);

  useEffect(() => {
    setVisibleCount(initialVisibleCount);
  }, [transcript, deferredSearch, roleFilter, initialVisibleCount]);

  const renderedTranscript = useMemo(
    () => filteredTranscript.slice(0, visibleCount),
    [filteredTranscript, visibleCount],
  );
  const hasMoreRenderedTranscript = renderedTranscript.length < filteredTranscript.length;
  const modeLabel = truncated ? messages.transcript.partial : messages.transcript.full;

  return (
    <>
      <div className="transcript-summary-strip">
        <div className="transcript-summary-main">
          <span className="overview-note-label">{messages.transcript.title}</span>
          <strong>
            {messageCount} {messages.transcript.messagesUnit}
          </strong>
          <span className="transcript-summary-badge">{modeLabel}</span>
        </div>
        <div className="transcript-summary-meta">
          <span className="transcript-summary-stat">
            <span className="overview-note-label">{messages.transcript.loadedCount}</span>
            <strong>{renderedTranscript.length}</strong>
          </span>
          <span className="transcript-summary-stat">
            <span className="overview-note-label">{messages.transcript.matchingCount}</span>
            <strong>{filteredTranscript.length}</strong>
          </span>
        </div>
      </div>
      <p className="sub-hint transcript-intro-copy">
        {roleFilter === "dialog"
          ? "Default is user and assistant only. Switch roles for system, tool, or developer logs."
          : "Transcript is filtered by role and search."}
      </p>
      <div className="chat-toolbar transcript-controls">
        <input
          type="search"
          className="search-input transcript-search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={messages.transcript.searchPlaceholder}
        />
        <select
          className="filter-select transcript-role-filter"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as RoleFilter)}
        >
          <option value="dialog">{messages.transcript.roleDialog}</option>
          <option value="all">{messages.transcript.roleAll}</option>
          <option value="user">{messages.transcript.roleUser}</option>
          <option value="assistant">{messages.transcript.roleAssistant}</option>
          <option value="developer">{messages.transcript.roleDeveloper}</option>
          <option value="system">{messages.transcript.roleSystem}</option>
          <option value="tool">{messages.transcript.roleTool}</option>
          <option value="unknown">{messages.transcript.roleUnknown}</option>
        </select>
        {roleFilter === "dialog" ? (
          <span className="sub-hint">{messages.transcript.dialogHint}</span>
        ) : null}
      </div>
      <div className="chat-toolbar transcript-actions-row">
        <button
          type="button"
          className="btn-outline"
          onClick={() => setVisibleCount((prev) => Math.min(prev + visibleStep, filteredTranscript.length))}
          disabled={loading || !hasMoreRenderedTranscript}
        >
          {messages.transcript.showMoreLoaded}
        </button>
        <button
          type="button"
          className="btn-outline"
          onClick={onLoadMore}
          disabled={loading || !truncated || limit >= maxLimit}
        >
          {messages.transcript.loadMoreFromSource}
        </button>
      </div>
      <div className="chat-log">
        {loading ? <div className="skeleton-line" /> : null}
        {!loading && filteredTranscript.length === 0 ? <p className="sub-hint">{resolvedEmptyLabel}</p> : null}
        {renderedTranscript.map((msg) => (
          <ChatMessage key={`msg-${msg.idx}-${msg.ts ?? "na"}`} msg={msg} roleLabel={roleLabel} />
        ))}
        {!loading && hasMoreRenderedTranscript ? (
          <p className="sub-hint">{messages.transcript.previewHint}</p>
        ) : null}
      </div>
    </>
  );
}

export type { TranscriptMessage };
