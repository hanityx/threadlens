import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "@/i18n";
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
  it("shows execute cleanup when a matching dry-run token is pending", () => {
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

    expect(html).toContain(messages.forensics.executeCleanup);
    expect(html).toContain(messages.forensics.cleanupExecuteReadyBody);
    expect(html).toContain("2 targets");
    expect(html).toContain(`${messages.forensics.stageDryRun} · ${messages.providers.resultPreviewReady}`);
    expect(html).toContain("DEL-123");
    expect(html).not.toContain("run impact next");
    expect(html).not.toContain("thread-review-card-metric");
    expect(html).not.toContain("detail-hero-forensics");
    expect(html).not.toContain("Flagged");
    expect(html).not.toContain("flagged");
  });

  it("does not repeat selected-row hero copy when the header already carries selection context", () => {
    const html = renderToStaticMarkup(
      <ForensicsPanel
        messages={messages}
        threadActionsDisabled={false}
        selectedIds={["thread-1"]}
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

  it("renders Korean forensics helper copy", () => {
    const koMessages = getMessages("ko");
    const html = renderToStaticMarkup(
      <ForensicsPanel
        messages={koMessages}
        threadActionsDisabled={false}
        selectedIds={[]}
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

    expect(html).toContain(koMessages.forensics.title);
    expect(html).toContain(koMessages.forensics.emptyGuidePickLabel);
    expect(html).toContain(koMessages.forensics.emptyGuidePickTitle);
    expect(html).toContain(koMessages.forensics.emptyGuideInspectTitle);
    expect(html).toContain(koMessages.forensics.emptyGuidePreviewTitle);
  });
});
