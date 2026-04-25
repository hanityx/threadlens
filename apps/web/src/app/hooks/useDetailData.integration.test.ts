import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProviderSessionRow } from "@/shared/types";
import { useDetailData } from "@/app/hooks/useDetailData";

function makeSession(provider = "codex"): ProviderSessionRow {
  return {
    provider,
    source: "sessions",
    session_id: `${provider}-session`,
    display_title: `${provider} session`,
    file_path: `/tmp/${provider}.jsonl`,
    size_bytes: 1024,
    mtime: "2026-04-20T00:00:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: `${provider} session`,
      title_source: "header",
    },
  };
}

function renderDetailData(options?: {
  selectedThreadId?: string;
  selectedSession?: ProviderSessionRow | null;
  providerById?: Map<string, { capabilities?: { safe_cleanup?: boolean } }>;
}) {
  let latest: ReturnType<typeof useDetailData> | undefined;

  function Harness() {
    latest = useDetailData({
      selectedThreadId: options?.selectedThreadId ?? "",
      selectedSession: options?.selectedSession ?? null,
      rows: [],
      providerSessionRows: [],
      selectedSessionPath: options?.selectedSession?.file_path ?? "",
      providerById:
        options?.providerById ??
        new Map([
          ["codex", { capabilities: { safe_cleanup: true } }],
          ["claude", { capabilities: { safe_cleanup: false } }],
        ]),
    });
    return createElement("div", null, "hook");
  }

  renderToStaticMarkup(createElement(Harness));
  return latest as ReturnType<typeof useDetailData>;
}

describe("useDetailData integration", () => {
  it("exposes the default limits and empty state when nothing is selected", () => {
    const result = renderDetailData();

    expect(result.threadDetailLoading).toBe(false);
    expect(result.selectedThreadDetail).toBeNull();
    expect(result.threadTranscriptData).toBeNull();
    expect(result.threadTranscriptLoading).toBe(false);
    expect(result.threadTranscriptLimit).toBe(250);
    expect(result.sessionTranscriptData).toBeNull();
    expect(result.sessionTranscriptLoading).toBe(false);
    expect(result.sessionTranscriptLimit).toBe(40);
    expect(result.canRunSelectedSessionAction).toBe(false);
  });

  it("derives selected-session action capability from provider metadata", () => {
    const result = renderDetailData({
      selectedSession: makeSession("codex"),
    });
    const readOnlyResult = renderDetailData({
      selectedSession: makeSession("claude"),
    });

    expect(result.canRunSelectedSessionAction).toBe(true);
    expect(readOnlyResult.canRunSelectedSessionAction).toBe(false);
    expect(result.threadTranscriptLimit).toBe(250);
    expect(result.sessionTranscriptLimit).toBe(40);
  });

  it("disables selected-session actions for cleanup_backups rows", () => {
    const result = renderDetailData({
      selectedSession: {
        ...makeSession("codex"),
        source: "cleanup_backups",
      },
    });

    expect(result.canRunSelectedSessionAction).toBe(false);
  });
});
