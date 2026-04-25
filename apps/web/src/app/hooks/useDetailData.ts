import { useEffect, useRef, useState } from "react";
import type {
  ThreadForensicsEnvelope,
  TranscriptPayload,
  ProviderSessionRow,
  ThreadRow,
} from "@/shared/types";
import { apiGet, apiPost } from "@/api";
import { extractEnvelopeData } from "@/shared/lib/format";

export const THREAD_TRANSCRIPT_INITIAL_LIMIT = 250;
export const SESSION_TRANSCRIPT_INITIAL_LIMIT = 40;

export function resolveThreadTranscriptCacheKey(threadId: string, limit: number): string {
  return `${threadId}|${limit}`;
}

export function resolveSessionTranscriptCacheKey(
  session: Pick<ProviderSessionRow, "provider" | "file_path">,
  limit: number,
): string {
  return `${session.provider}|${session.file_path}|${limit}`;
}

export function buildThreadTranscriptPath(threadId: string, limit: number): string {
  return `/api/thread-transcript?thread_id=${encodeURIComponent(threadId)}&limit=${limit}`;
}

export function buildSessionTranscriptPath(
  session: Pick<ProviderSessionRow, "provider" | "file_path">,
  limit: number,
): string {
  return `/api/session-transcript?provider=${encodeURIComponent(session.provider)}&file_path=${encodeURIComponent(session.file_path)}&limit=${limit}`;
}

export function resolveSelectedThreadDetail(
  raw: unknown,
): NonNullable<ThreadForensicsEnvelope["reports"]>[number] | null {
  const threadDetailData = extractEnvelopeData<ThreadForensicsEnvelope>(raw);
  return threadDetailData?.reports?.[0] ?? null;
}

export function resolveCanRunSelectedSessionAction(
  selectedSession: ProviderSessionRow | null,
  providerById: Map<string, { capabilities?: { safe_cleanup?: boolean } }>,
): boolean {
  const selectedSessionMeta = selectedSession ? providerById.get(selectedSession.provider) : null;
  return Boolean(
    selectedSessionMeta?.capabilities?.safe_cleanup &&
      selectedSession?.source !== "cleanup_backups",
  );
}

export function resolveThreadSelectionResetState(selectedThreadId: string) {
  if (selectedThreadId) return null;
  return {
    threadDetailRaw: null,
    threadDetailLoading: false,
    threadTranscriptRaw: null,
    threadTranscriptLoading: false,
    threadTranscriptLimit: THREAD_TRANSCRIPT_INITIAL_LIMIT,
  };
}

export function resolveSessionSelectionResetState(selectedSession: ProviderSessionRow | null) {
  if (selectedSession) return null;
  return {
    sessionTranscriptRaw: null,
    sessionTranscriptLoading: false,
    sessionTranscriptLimit: SESSION_TRANSCRIPT_INITIAL_LIMIT,
  };
}

export function resolveCachedQueryState(cached: unknown) {
  if (!cached) return null;
  return {
    raw: cached,
    loading: false,
  };
}

export function useDetailData(options: {
  selectedThreadId: string;
  selectedSession: ProviderSessionRow | null;
  rows: ThreadRow[];
  providerSessionRows: ProviderSessionRow[];
  selectedSessionPath: string;
  providerById: Map<string, { capabilities?: { safe_cleanup?: boolean } }>;
}) {
  const {
    selectedThreadId,
    selectedSession,
    providerById,
  } = options;

  /* ---- state ---- */
  const [threadDetailRaw, setThreadDetailRaw] = useState<unknown>(null);
  const [threadDetailLoading, setThreadDetailLoading] = useState(false);
  const [threadTranscriptRaw, setThreadTranscriptRaw] = useState<unknown>(null);
  const [threadTranscriptLoading, setThreadTranscriptLoading] = useState(false);
  const [threadTranscriptLimit, setThreadTranscriptLimit] = useState(THREAD_TRANSCRIPT_INITIAL_LIMIT);
  const [sessionTranscriptRaw, setSessionTranscriptRaw] = useState<unknown>(null);
  const [sessionTranscriptLoading, setSessionTranscriptLoading] = useState(false);
  const [sessionTranscriptLimit, setSessionTranscriptLimit] = useState(SESSION_TRANSCRIPT_INITIAL_LIMIT);
  const threadDetailCacheRef = useRef<Map<string, unknown>>(new Map());
  const threadTranscriptCacheRef = useRef<Map<string, unknown>>(new Map());
  const sessionTranscriptCacheRef = useRef<Map<string, unknown>>(new Map());

  /* ---- thread detail loading ---- */
  useEffect(() => {
    const threadResetState = resolveThreadSelectionResetState(selectedThreadId);
    if (threadResetState) {
      setThreadDetailRaw(threadResetState.threadDetailRaw);
      setThreadDetailLoading(threadResetState.threadDetailLoading);
      setThreadTranscriptRaw(threadResetState.threadTranscriptRaw);
      setThreadTranscriptLoading(threadResetState.threadTranscriptLoading);
      setThreadTranscriptLimit(threadResetState.threadTranscriptLimit);
      return;
    }
    const cached = threadDetailCacheRef.current.get(selectedThreadId);
    const cachedState = resolveCachedQueryState(cached);
    if (cachedState) {
      setThreadDetailRaw(cachedState.raw);
      setThreadDetailLoading(cachedState.loading);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setThreadDetailLoading(true);
    apiPost<unknown>(
      "/api/thread-forensics",
      { ids: [selectedThreadId] },
      { signal: controller.signal },
    )
      .then((data) => {
        if (!cancelled) {
          threadDetailCacheRef.current.set(selectedThreadId, data);
          setThreadDetailRaw(data);
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) setThreadDetailRaw(null);
      })
      .finally(() => {
        if (!cancelled) setThreadDetailLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedThreadId]);

  /* ---- thread transcript loading ---- */
  useEffect(() => {
    if (!selectedThreadId) {
      setThreadTranscriptRaw(null);
      return;
    }
    const cacheKey = resolveThreadTranscriptCacheKey(selectedThreadId, threadTranscriptLimit);
    const cached = threadTranscriptCacheRef.current.get(cacheKey);
    const cachedState = resolveCachedQueryState(cached);
    if (cachedState) {
      setThreadTranscriptRaw(cachedState.raw);
      setThreadTranscriptLoading(cachedState.loading);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setThreadTranscriptLoading(true);
    apiGet<unknown>(
      buildThreadTranscriptPath(selectedThreadId, threadTranscriptLimit),
      { signal: controller.signal },
    )
      .then((data) => {
        if (!cancelled) {
          threadTranscriptCacheRef.current.set(cacheKey, data);
          setThreadTranscriptRaw(data);
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) setThreadTranscriptRaw(null);
      })
      .finally(() => {
        if (!cancelled) setThreadTranscriptLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedThreadId, threadTranscriptLimit]);

  /* ---- session transcript loading ---- */
  useEffect(() => {
    const sessionResetState = resolveSessionSelectionResetState(selectedSession);
    if (sessionResetState) {
      setSessionTranscriptRaw(sessionResetState.sessionTranscriptRaw);
      setSessionTranscriptLoading(sessionResetState.sessionTranscriptLoading);
      setSessionTranscriptLimit(sessionResetState.sessionTranscriptLimit);
      return;
    }
    const activeSession = selectedSession;
    if (!activeSession) return;
    const cacheKey = resolveSessionTranscriptCacheKey(activeSession, sessionTranscriptLimit);
    const cached = sessionTranscriptCacheRef.current.get(cacheKey);
    const cachedState = resolveCachedQueryState(cached);
    if (cachedState) {
      setSessionTranscriptRaw(cachedState.raw);
      setSessionTranscriptLoading(cachedState.loading);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setSessionTranscriptLoading(true);
    apiGet<unknown>(
      buildSessionTranscriptPath(activeSession, sessionTranscriptLimit),
      { signal: controller.signal },
    )
      .then((data) => {
        if (!cancelled) {
          sessionTranscriptCacheRef.current.set(cacheKey, data);
          setSessionTranscriptRaw(data);
        }
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) setSessionTranscriptRaw(null);
      })
      .finally(() => {
        if (!cancelled) setSessionTranscriptLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedSession, sessionTranscriptLimit]);

  /* ---- derived ---- */
  const selectedThreadDetail = resolveSelectedThreadDetail(threadDetailRaw);
  const threadTranscriptData = extractEnvelopeData<TranscriptPayload>(threadTranscriptRaw);
  const sessionTranscriptData = extractEnvelopeData<TranscriptPayload>(sessionTranscriptRaw);
  const canRunSelectedSessionAction = resolveCanRunSelectedSessionAction(selectedSession, providerById);

  return {
    threadDetailLoading, selectedThreadDetail,
    threadTranscriptData, threadTranscriptLoading,
    threadTranscriptLimit, setThreadTranscriptLimit,
    sessionTranscriptData, sessionTranscriptLoading,
    sessionTranscriptLimit, setSessionTranscriptLimit,
    canRunSelectedSessionAction,
  };
}
