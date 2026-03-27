import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "../../i18n";
import type { CleanupPreviewData, ThreadRow } from "../../types";
import { ThreadsTable } from "./ThreadsTable";

const messages = getMessages("en");

const rows: ThreadRow[] = [
  {
    thread_id: "thread-1234567890",
    title: "Review this cleanup candidate",
    risk_score: 82,
    risk_level: "high",
    risk_tags: ["orphan-candidate", "ctx-high"],
    is_pinned: false,
    source: "sessions",
    timestamp: "2026-03-27T00:00:00.000Z",
    activity_status: "stale",
  },
];

describe("ThreadsTable", () => {
  it("renders cleanup-signal copy instead of risk-heavy labels", () => {
    const cleanupData: CleanupPreviewData | null = null;
    const html = renderToStaticMarkup(
      <ThreadsTable
        messages={messages}
        visibleRows={rows}
        filteredRows={rows}
        totalCount={1}
        threadsLoading={false}
        threadsError={false}
        selected={{}}
        setSelected={vi.fn()}
        selectedThreadId=""
        setSelectedThreadId={vi.fn()}
        allFilteredSelected={false}
        toggleSelectAllFiltered={vi.fn()}
        selectedIds={[]}
        selectedImpactCount={0}
        cleanupData={cleanupData}
        busy={false}
        threadActionsDisabled={false}
        bulkPin={vi.fn()}
        bulkUnpin={vi.fn()}
        bulkArchive={vi.fn()}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
      />,
    );

    expect(html).toContain("Cleanup signal");
    expect(html).toContain("Select high signal only");
  });
});
