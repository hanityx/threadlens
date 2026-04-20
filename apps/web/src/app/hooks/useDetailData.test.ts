import { describe, expect, it } from "vitest";
import type { ProviderSessionRow } from "@/shared/types";
import {
  buildSessionTranscriptPath,
  buildThreadTranscriptPath,
  resolveCanRunSelectedSessionAction,
  resolveCachedQueryState,
  resolveSelectedThreadDetail,
  resolveSessionSelectionResetState,
  resolveSessionTranscriptCacheKey,
  resolveThreadSelectionResetState,
  resolveThreadTranscriptCacheKey,
  SESSION_TRANSCRIPT_INITIAL_LIMIT,
  THREAD_TRANSCRIPT_INITIAL_LIMIT,
} from "@/app/hooks/useDetailData";

describe("useDetailData transcript limits", () => {
  it("keeps the session transcript initial limit below the thread transcript default", () => {
    expect(SESSION_TRANSCRIPT_INITIAL_LIMIT).toBe(40);
    expect(SESSION_TRANSCRIPT_INITIAL_LIMIT).toBeLessThan(THREAD_TRANSCRIPT_INITIAL_LIMIT);
  });
});

describe("useDetailData helpers", () => {
  const session: ProviderSessionRow = {
    provider: "codex",
    source: "sessions",
    session_id: "session-1",
    display_title: "Session 1",
    file_path: "/tmp/session.jsonl",
    size_bytes: 1024,
    mtime: "2026-04-20T00:00:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: "Session 1",
      title_source: "header",
    },
  };

  it("builds stable transcript cache keys and request paths", () => {
    expect(resolveThreadTranscriptCacheKey("thread-1", 250)).toBe("thread-1|250");
    expect(resolveSessionTranscriptCacheKey(session, 40)).toBe("codex|/tmp/session.jsonl|40");
    expect(buildThreadTranscriptPath("thread-1", 250)).toBe(
      "/api/thread-transcript?thread_id=thread-1&limit=250",
    );
    expect(buildSessionTranscriptPath(session, 40)).toBe(
      "/api/session-transcript?provider=codex&file_path=%2Ftmp%2Fsession.jsonl&limit=40",
    );
  });

  it("extracts the first report and derives selected-session action capability", () => {
    expect(
      resolveSelectedThreadDetail({
        data: {
          reports: [{ thread_id: "thread-1", findings: [] }],
        },
      }),
    ).toEqual({ thread_id: "thread-1", findings: [] });
    expect(resolveSelectedThreadDetail({ data: { reports: [] } })).toBeNull();

    const providerById = new Map([
      ["codex", { capabilities: { safe_cleanup: true } }],
      ["claude", { capabilities: { safe_cleanup: false } }],
    ]);

    expect(resolveCanRunSelectedSessionAction(session, providerById)).toBe(true);
    expect(
      resolveCanRunSelectedSessionAction(
        { ...session, provider: "claude" },
        providerById,
      ),
    ).toBe(false);
    expect(resolveCanRunSelectedSessionAction(null, providerById)).toBe(false);
  });

  it("resets transcript state only when selections disappear and reuses cached query state", () => {
    expect(resolveThreadSelectionResetState("thread-1")).toBeNull();
    expect(resolveThreadSelectionResetState("")).toEqual({
      threadDetailRaw: null,
      threadDetailLoading: false,
      threadTranscriptRaw: null,
      threadTranscriptLoading: false,
      threadTranscriptLimit: THREAD_TRANSCRIPT_INITIAL_LIMIT,
    });

    expect(resolveSessionSelectionResetState(session)).toBeNull();
    expect(resolveSessionSelectionResetState(null)).toEqual({
      sessionTranscriptRaw: null,
      sessionTranscriptLoading: false,
      sessionTranscriptLimit: SESSION_TRANSCRIPT_INITIAL_LIMIT,
    });

    expect(resolveCachedQueryState(null)).toBeNull();
    expect(resolveCachedQueryState({ data: { ok: true } })).toEqual({
      raw: { data: { ok: true } },
      loading: false,
    });
  });
});
