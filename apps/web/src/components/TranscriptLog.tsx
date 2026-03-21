import { useDeferredValue, useMemo, useState } from "react";
import type { Messages } from "../i18n";

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
  emptyLabel?: string;
  onLoadMore: () => void;
};

export function TranscriptLog({
  messages,
  transcript,
  loading,
  truncated,
  messageCount,
  limit,
  maxLimit = 2000,
  emptyLabel,
  onLoadMore,
}: Props) {
  const [searchInput, setSearchInput] = useState("");
  const [roleFilter, setRoleFilter] = useState<TranscriptMessage["role"] | "all">("all");
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
      if (roleFilter !== "all" && msg.role !== roleFilter) return false;
      if (!q) return true;
      const text = `${msg.text ?? ""} ${msg.source_type ?? ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [transcript, deferredSearch, roleFilter]);

  return (
    <>
      <div className="impact-kv">
        <span>{messages.transcript.title}</span>
        <strong>
          {messageCount} {messages.transcript.messagesUnit}
        </strong>
      </div>
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
          onChange={(e) => setRoleFilter(e.target.value as TranscriptMessage["role"] | "all")}
        >
          <option value="all">{messages.transcript.roleAll}</option>
          <option value="user">{messages.transcript.roleUser}</option>
          <option value="assistant">{messages.transcript.roleAssistant}</option>
          <option value="developer">{messages.transcript.roleDeveloper}</option>
          <option value="system">{messages.transcript.roleSystem}</option>
          <option value="tool">{messages.transcript.roleTool}</option>
          <option value="unknown">{messages.transcript.roleUnknown}</option>
        </select>
        <span className="sub-hint">
          {messages.transcript.filteredCount} {filteredTranscript.length}
        </span>
      </div>
      <div className="chat-toolbar">
        <span className="sub-hint">{truncated ? messages.transcript.partial : messages.transcript.full}</span>
        <button type="button" className="btn-outline" onClick={onLoadMore} disabled={loading || limit >= maxLimit}>
          {messages.transcript.loadMore}
        </button>
      </div>
      <div className="chat-log">
        {loading ? <div className="skeleton-line" /> : null}
        {!loading && filteredTranscript.length === 0 ? <p className="sub-hint">{resolvedEmptyLabel}</p> : null}
        {filteredTranscript.map((msg) => (
          <article key={`msg-${msg.idx}-${msg.ts ?? "na"}`} className={`chat-item role-${msg.role}`}>
            <header>
              <strong>{roleLabel(msg.role)}</strong>
              <span>{msg.ts ? new Date(msg.ts).toLocaleString() : msg.source_type}</span>
            </header>
            <p>{msg.text}</p>
          </article>
        ))}
      </div>
    </>
  );
}

export type { TranscriptMessage };
