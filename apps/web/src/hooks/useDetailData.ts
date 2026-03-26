import { useEffect, useRef, useState } from "react";
import type {
  ThreadForensicsEnvelope,
  TranscriptPayload,
  ProviderSessionRow,
  ThreadRow,
} from "../types";
import { apiGet, apiPost } from "../api";
import { extractEnvelopeData } from "../lib/helpers";

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
  const [threadTranscriptLimit, setThreadTranscriptLimit] = useState(250);
  const [sessionTranscriptRaw, setSessionTranscriptRaw] = useState<unknown>(null);
  const [sessionTranscriptLoading, setSessionTranscriptLoading] = useState(false);
  const [sessionTranscriptLimit, setSessionTranscriptLimit] = useState(120);
  const threadDetailCacheRef = useRef<Map<string, unknown>>(new Map());
  const threadTranscriptCacheRef = useRef<Map<string, unknown>>(new Map());
  const sessionTranscriptCacheRef = useRef<Map<string, unknown>>(new Map());

  /* ---- thread detail loading ---- */
  useEffect(() => {
    if (!selectedThreadId) {
      setThreadDetailRaw(null);
      setThreadTranscriptRaw(null);
      setThreadTranscriptLimit(250);
      return;
    }
    const cached = threadDetailCacheRef.current.get(selectedThreadId);
    if (cached) {
      setThreadDetailRaw(cached);
      setThreadDetailLoading(false);
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
    const cacheKey = `${selectedThreadId}|${threadTranscriptLimit}`;
    const cached = threadTranscriptCacheRef.current.get(cacheKey);
    if (cached) {
      setThreadTranscriptRaw(cached);
      setThreadTranscriptLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setThreadTranscriptLoading(true);
    apiGet<unknown>(
      `/api/thread-transcript?thread_id=${encodeURIComponent(selectedThreadId)}&limit=${threadTranscriptLimit}`,
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
    if (!selectedSession) {
      setSessionTranscriptRaw(null);
      setSessionTranscriptLimit(250);
      return;
    }
    const cacheKey = `${selectedSession.provider}|${selectedSession.file_path}|${sessionTranscriptLimit}`;
    const cached = sessionTranscriptCacheRef.current.get(cacheKey);
    if (cached) {
      setSessionTranscriptRaw(cached);
      setSessionTranscriptLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setSessionTranscriptLoading(true);
    apiGet<unknown>(
      `/api/session-transcript?provider=${encodeURIComponent(selectedSession.provider)}&file_path=${encodeURIComponent(selectedSession.file_path)}&limit=${sessionTranscriptLimit}`,
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
  const threadDetailData = extractEnvelopeData<ThreadForensicsEnvelope>(threadDetailRaw);
  const selectedThreadDetail = threadDetailData?.reports?.[0] ?? null;
  const threadTranscriptData = extractEnvelopeData<TranscriptPayload>(threadTranscriptRaw);
  const sessionTranscriptData = extractEnvelopeData<TranscriptPayload>(sessionTranscriptRaw);
  const selectedSessionMeta = selectedSession ? providerById.get(selectedSession.provider) : null;
  const canRunSelectedSessionAction = Boolean(selectedSessionMeta?.capabilities?.safe_cleanup);

  return {
    threadDetailLoading, selectedThreadDetail,
    threadTranscriptData, threadTranscriptLoading,
    threadTranscriptLimit, setThreadTranscriptLimit,
    sessionTranscriptData, sessionTranscriptLoading,
    sessionTranscriptLimit, setSessionTranscriptLimit,
    canRunSelectedSessionAction,
  };
}
