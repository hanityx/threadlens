import { createPortal } from "react-dom";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { WheelEvent } from "react";
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
  onLoadFullSource?: () => void;
  initialFocusViewOpen?: boolean;
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
  onLoadFullSource,
  initialFocusViewOpen = false,
}: Props) {
  const [searchInput, setSearchInput] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("dialog");
  const [visibleCount, setVisibleCount] = useState(initialVisibleCount);
  const [orderMode, setOrderMode] = useState<"oldest" | "newest">("oldest");
  const [focusViewOpen, setFocusViewOpen] = useState(initialFocusViewOpen);
  const focusLogRef = useRef<HTMLDivElement | null>(null);
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

  const orderedTranscript = useMemo(
    () => (orderMode === "newest" ? [...filteredTranscript].reverse() : filteredTranscript),
    [filteredTranscript, orderMode],
  );

  useEffect(() => {
    setVisibleCount(initialVisibleCount);
  }, [transcript, deferredSearch, roleFilter, initialVisibleCount]);

  useEffect(() => {
    if (!focusViewOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFocusViewOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [focusViewOpen]);

  const renderedTranscript = useMemo(
    () => orderedTranscript.slice(0, visibleCount),
    [orderedTranscript, visibleCount],
  );
  const hasMoreRenderedTranscript = renderedTranscript.length < orderedTranscript.length;
  const modeLabel = truncated ? messages.transcript.partial : messages.transcript.full;

  const handleFocusBodyWheel = (event: WheelEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    if (target.scrollHeight <= target.clientHeight) return;
    event.preventDefault();
    target.scrollTop += event.deltaY;
    if (event.deltaX !== 0) {
      target.scrollLeft += event.deltaX;
    }
  };

  const renderTranscriptControls = (focusMode: boolean) => (
    <>
      <div className="chat-toolbar transcript-controls">
        <div className="toolbar-search-shell is-input">
          <span className="toolbar-search-prompt" aria-hidden="true">
            &gt;
          </span>
          <input
            type="search"
            className="search-input transcript-search toolbar-search-input"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={messages.transcript.searchPlaceholder}
          />
        </div>
        <div className="toolbar-search-shell is-select">
          <select
            className="filter-select transcript-role-filter toolbar-search-select"
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
          <span className="toolbar-search-chevron" aria-hidden="true">
            ▾
          </span>
        </div>
      </div>
      <div className="chat-toolbar transcript-actions-row">
        <button
          type="button"
          className="btn-outline"
          onClick={() => setOrderMode((prev) => (prev === "oldest" ? "newest" : "oldest"))}
          disabled={loading || filteredTranscript.length === 0}
        >
          {orderMode === "oldest" ? messages.transcript.orderNewestFirst : messages.transcript.orderOldestFirst}
        </button>
        <button
          type="button"
          className="btn-outline"
          onClick={() => setVisibleCount((prev) => Math.min(prev + visibleStep, orderedTranscript.length))}
          disabled={loading || !hasMoreRenderedTranscript}
        >
          {messages.transcript.showMoreLoaded}
        </button>
        <button
          type="button"
          className="btn-outline"
          onClick={onLoadFullSource}
          disabled={loading || !truncated || limit >= maxLimit || !onLoadFullSource}
        >
          {messages.transcript.loadFullSource}
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
    </>
  );

  const renderTranscriptBody = (focusMode: boolean) => (
      <div className={`chat-log ${focusMode ? "chat-log-focus" : ""}`.trim()}>
      {loading ? <div className="skeleton-line" /> : null}
      {!loading && filteredTranscript.length === 0 ? <p className="sub-hint">{resolvedEmptyLabel}</p> : null}
      {renderedTranscript.map((msg) => (
        <ChatMessage key={`${focusMode ? "focus" : "inline"}-msg-${msg.idx}-${msg.ts ?? "na"}`} msg={msg} roleLabel={roleLabel} />
      ))}
      {!loading && hasMoreRenderedTranscript ? (
        <p className="sub-hint">{messages.transcript.previewHint}</p>
      ) : null}
    </div>
  );

  const renderTranscriptChrome = () => (
    <div className="transcript-shell">
      <div className="transcript-summary-strip">
        <div className="transcript-summary-main">
          <span className="overview-note-label">{messages.transcript.title}</span>
          <strong>
            {messageCount} {messages.transcript.messagesUnit}
          </strong>
        </div>
        <div className="transcript-summary-meta">
          <span className="transcript-summary-badge">{modeLabel}</span>
          <span className="transcript-summary-stat">
            <span className="overview-note-label">{messages.transcript.loadedCount}</span>
            <strong>{renderedTranscript.length}</strong>
          </span>
          <span className="transcript-summary-stat">
            <span className="overview-note-label">{messages.transcript.matchingCount}</span>
            <strong>{filteredTranscript.length}</strong>
          </span>
          <button
            type="button"
            className="btn-outline transcript-focus-trigger"
            aria-label={messages.transcript.openFocusView}
            onClick={() => setFocusViewOpen(true)}
          >
            ⤢
          </button>
        </div>
      </div>
      {renderTranscriptControls(false)}
      {renderTranscriptBody(false)}
    </div>
  );

  const renderFocusView = () => (
    <section className="transcript-focus-sheet">
      <header className="transcript-focus-head">
        <div className="transcript-focus-head-copy">
          <span className="overview-note-label">{messages.transcript.title}</span>
          <strong>
            {messageCount} {messages.transcript.messagesUnit}
          </strong>
          <p>
            {modeLabel} · {messages.transcript.loadedCount} {renderedTranscript.length} · {messages.transcript.matchingCount} {filteredTranscript.length}
          </p>
        </div>
        <button
          type="button"
          className="btn-outline transcript-focus-close"
          aria-label={messages.transcript.closeFocusView}
          onClick={() => setFocusViewOpen(false)}
        >
          ✕
        </button>
      </header>
      <div className="transcript-focus-controls">
        {renderTranscriptControls(true)}
      </div>
      <div ref={focusLogRef} className="transcript-focus-body" onWheel={handleFocusBodyWheel}>
        {renderTranscriptBody(true)}
      </div>
    </section>
  );

  const focusViewOverlay = (
    <div
      className="transcript-focus-modal"
      role="dialog"
      aria-modal="true"
      aria-label={messages.transcript.title}
      onClick={() => setFocusViewOpen(false)}
    >
      <div
        className="transcript-focus-card"
        onClick={(event) => event.stopPropagation()}
      >
        {renderFocusView()}
      </div>
    </div>
  );

  return (
    <>
      {renderTranscriptChrome()}
      {focusViewOpen
        ? typeof document !== "undefined"
          ? createPortal(focusViewOverlay, document.body)
          : focusViewOverlay
        : null}
    </>
  );
}

export type { TranscriptMessage };
