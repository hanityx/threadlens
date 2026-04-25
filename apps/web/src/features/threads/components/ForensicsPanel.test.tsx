import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "@/i18n/catalog";
import type { CleanupPreviewData, ThreadRow } from "@/shared/types";
import { buildThreadCleanupSelectionKey, THREAD_CLEANUP_DEFAULT_OPTIONS } from "@/shared/lib/appState";
import { ForensicsPanel } from "@/features/threads/components/ForensicsPanel";

const messages = getMessages("en");

const rows: ThreadRow[] = [
  {
    thread_id: "thread-1",
    title: "Cleanup candidate",
    risk_score: 82,
    risk_level: "high",
    risk_tags: ["orphan-candidate"],
    is_pinned: false,
    source: "sessions",
    timestamp: "2026-03-27T00:00:00.000Z",
    activity_status: "stale",
  },
];

describe("ForensicsPanel", () => {
  it("keeps cleanup preview result cards out of cleanup check", () => {
    const cleanupData: CleanupPreviewData = {
      ok: true,
      mode: "dry-run",
      confirm_token_expected: "DEL-123",
      target_file_count: 2,
      backup: { backup_dir: "", copied_count: 0 },
      state_result: { changed: true, removed: { titles: 1, order: 0, pinned: 0 } },
    };

    const html = renderToStaticMarkup(
      <ForensicsPanel
        messages={messages}
        threadActionsDisabled={false}
        selectedIds={["thread-1"]}
        selectedThreadId="thread-1"
        rows={rows}
        busy={false}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
        cleanupExecute={vi.fn()}
        cleanupData={cleanupData}
        pendingCleanup={{
          ids: ["thread-1"],
          confirmToken: "DEL-123",
          selectionKey: buildThreadCleanupSelectionKey(["thread-1"], THREAD_CLEANUP_DEFAULT_OPTIONS),
          options: THREAD_CLEANUP_DEFAULT_OPTIONS,
        }}
        selectedImpactRows={[]}
        analysisRaw={null}
        cleanupRaw={cleanupData}
        analyzeDeleteError={false}
        cleanupDryRunError={false}
        cleanupExecuteError={false}
        analyzeDeleteErrorMessage=""
        cleanupDryRunErrorMessage=""
        cleanupExecuteErrorMessage=""
      />,
    );

    expect(html).not.toContain("Execute cleanup");
    expect(html).not.toContain("Backups stay local before delete.");
    expect(html).not.toContain("2 targets");
    expect(html).not.toContain("Cleanup preview ready");
    expect(html).not.toContain("Confirm targets before delete.");
    expect(html).not.toContain("Copy token");
    expect(html).not.toContain("copy the token only after review.");
    expect(html).not.toContain("DEL-123");
    expect(html).not.toContain("confirm_token_expected");
    expect(html).not.toContain("run impact next");
    expect(html).not.toContain("thread-review-card-metric");
    expect(html).not.toContain("detail-hero-forensics");
    expect(html).not.toContain("Flagged");
    expect(html).not.toContain("flagged");
    expect(html).not.toContain("Signal score");
  });

  it("does not repeat selected-row hero copy when the header already carries selection context", () => {
    const html = renderToStaticMarkup(
      <ForensicsPanel
        messages={messages}
        threadActionsDisabled={false}
        selectedIds={["thread-1"]}
        selectedThreadId="thread-1"
        rows={rows}
        busy={false}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
        cleanupExecute={vi.fn()}
        cleanupData={null}
        pendingCleanup={null}
        selectedImpactRows={[]}
        analysisRaw={null}
        cleanupRaw={null}
        analyzeDeleteError={false}
        cleanupDryRunError={false}
        cleanupExecuteError={false}
        analyzeDeleteErrorMessage=""
        cleanupDryRunErrorMessage=""
        cleanupExecuteErrorMessage=""
      />
    );

    expect(html).not.toContain("1 Row Selected");
    expect(html).not.toContain("detail-hero-forensics");
    expect(html).not.toContain("run impact next");
  });

  it("keeps pending cleanup preview copy free of token wording", () => {
    const html = renderToStaticMarkup(
      <ForensicsPanel
        messages={messages}
        threadActionsDisabled={false}
        selectedIds={["thread-1"]}
        selectedThreadId="thread-1"
        rows={rows}
        busy={false}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
        cleanupExecute={vi.fn()}
        cleanupData={null}
        pendingCleanup={null}
        selectedImpactRows={[]}
        analysisRaw={null}
        cleanupRaw={null}
        analyzeDeleteError={false}
        cleanupDryRunError={false}
        cleanupExecuteError={false}
        analyzeDeleteErrorMessage=""
        cleanupDryRunErrorMessage=""
        cleanupExecuteErrorMessage=""
      />,
    );

    expect(html).not.toContain("Run a cleanup preview first.");
    expect(html).not.toContain("Preview cleanup");
    expect(html).not.toContain("token");
    expect(html).not.toContain("Token");
  });

  it("redacts nested cleanup tokens from raw payload rendering", () => {
    const cleanupData: CleanupPreviewData = {
      ok: true,
      mode: "dry-run",
      confirm_token_expected: "DEL-123",
      target_file_count: 1,
      backup: { backup_dir: "", copied_count: 0 },
      state_result: { changed: false, removed: { titles: 0, order: 0, pinned: 0 } },
    };
    const html = renderToStaticMarkup(
      <ForensicsPanel
        messages={messages}
        threadActionsDisabled={false}
        selectedIds={["thread-1"]}
        selectedThreadId="thread-1"
        rows={rows}
        busy={false}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
        cleanupExecute={vi.fn()}
        cleanupData={cleanupData}
        pendingCleanup={null}
        selectedImpactRows={[]}
        analysisRaw={null}
        cleanupRaw={{
          ok: true,
          data: {
            confirm_token_expected: "DEL-123",
            nested: { confirm_token_expected: "DEL-456" },
          },
        }}
        analyzeDeleteError={false}
        cleanupDryRunError={false}
        cleanupExecuteError={false}
        analyzeDeleteErrorMessage=""
        cleanupDryRunErrorMessage=""
        cleanupExecuteErrorMessage=""
      />,
    );

    expect(html).toContain("&quot;data&quot;: {");
    expect(html).toContain("&quot;nested&quot;: {}");
    expect(html).not.toContain("DEL-123");
    expect(html).not.toContain("DEL-456");
    expect(html).not.toContain("confirm_token_expected");
  });

  it("drops analysis raw JSON while keeping readable cross-session evidence available", () => {
    const html = renderToStaticMarkup(
      <ForensicsPanel
        messages={messages}
        threadActionsDisabled={false}
        selectedIds={["thread-1"]}
        selectedThreadId="thread-1"
        rows={rows}
        busy={false}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
        cleanupExecute={vi.fn()}
        cleanupData={null}
        pendingCleanup={null}
        selectedImpactRows={[
          {
            id: "thread-1",
            title: "Cleanup candidate",
            summary: "Strong cross-session links found",
            cross_session_links: {
              strong_samples: [
                {
                  thread_id: "thread-2",
                  title: "Sibling thread",
                  direction: "both",
                  strength: "strong",
                  evidence_kind: "search_text",
                  matched_field: "copied_context",
                  matched_value: "/Users/example/workspace/raw-value",
                  matched_excerpt: "sample excerpt from /Users/example/workspace/raw-excerpt",
                },
              ],
            },
          } as never,
        ]}
        analysisRaw={{
          ok: true,
          data: {
            matched_excerpt: "sample excerpt from /Users/example/workspace/raw-excerpt",
            matched_value: "/Users/example/workspace/raw-value",
            file_path: "/Users/example/workspace/thread.jsonl",
          },
        }}
        cleanupRaw={null}
        analyzeDeleteError={false}
        cleanupDryRunError={false}
        cleanupExecuteError={false}
        analyzeDeleteErrorMessage=""
        cleanupDryRunErrorMessage=""
        cleanupExecuteErrorMessage=""
        initialCrossSessionView="strong"
      />,
    );

    expect(html).toContain("Linked sessions found");
    expect(html).toContain("Reference details");
    expect(html).toContain("This session search history includes the current thread ID.");
    expect(html).toContain("Log field");
    expect(html).toContain("Matched snippet");
    expect(html).toContain("Sibling thread");
    expect(html).toContain("copied_context");
    expect(html).toContain("/user-root/&lt;redacted&gt;");
    expect(html).not.toContain("Why this link was detected");
    expect(html).not.toContain("Impact payload (JSON)");
    expect(html).not.toContain("raw-excerpt");
    expect(html).not.toContain("raw-value");
    expect(html).not.toContain("/Users/example/workspace/thread.jsonl");
  });

  it("does not crash when readable cross-session evidence renders in a browser-like runtime without process", () => {
    const originalProcess = globalThis.process;
    // Simulate the browser runtime where process is not available.
    // @ts-expect-error test-only override
    globalThis.process = undefined;

    try {
      expect(() =>
        renderToStaticMarkup(
          <ForensicsPanel
            messages={messages}
            threadActionsDisabled={false}
            selectedIds={["thread-1"]}
            selectedThreadId="thread-1"
            rows={rows}
            busy={false}
            analyzeDelete={vi.fn()}
            cleanupDryRun={vi.fn()}
            cleanupExecute={vi.fn()}
            cleanupData={null}
            pendingCleanup={null}
            selectedImpactRows={[
              {
                id: "thread-1",
                title: "Cleanup candidate",
                summary: "Strong cross-session links found",
                cross_session_links: {
                  mention_samples: [
                    {
                      thread_id: "thread-2",
                      title: "Sibling thread",
                      direction: "both",
                      strength: "mention",
                      evidence_kind: "command_output",
                      matched_field: "payload.command",
                      matched_event: "event_msg",
                      matched_value: "/Users/example/workspace/raw-value",
                      matched_excerpt: "sample excerpt from /Users/example/workspace/raw-excerpt",
                    },
                  ],
                },
              } as never,
            ]}
            analysisRaw={null}
            cleanupRaw={null}
            analyzeDeleteError={false}
            cleanupDryRunError={false}
            cleanupExecuteError={false}
            analyzeDeleteErrorMessage=""
            cleanupDryRunErrorMessage=""
            cleanupExecuteErrorMessage=""
            initialCrossSessionView="mention"
          />,
        ),
      ).not.toThrow();
    } finally {
      globalThis.process = originalProcess;
    }
  });

  it("renders Korean forensics helper copy", () => {
    const koMessages = getMessages("ko");
    const html = renderToStaticMarkup(
      <ForensicsPanel
        messages={koMessages}
        threadActionsDisabled={false}
        selectedIds={[]}
        selectedThreadId=""
        rows={rows}
        busy={false}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
        cleanupExecute={vi.fn()}
        cleanupData={null}
        pendingCleanup={null}
        selectedImpactRows={[]}
        analysisRaw={null}
        cleanupRaw={null}
        analyzeDeleteError={false}
        cleanupDryRunError={false}
        cleanupExecuteError={false}
        analyzeDeleteErrorMessage=""
        cleanupDryRunErrorMessage=""
        cleanupExecuteErrorMessage=""
      />,
    );

    expect(html).toContain("Cleanup Check");
    expect(html).toContain("행 선택");
    expect(html).toContain("영향 확인");
    expect(html).not.toContain(">1</span>");
    expect(html).not.toContain(">2</span>");
    expect(html).not.toContain("정리 미리보기");
    expect(html).not.toContain("증거 보기");
  });
});
