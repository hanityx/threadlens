import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "../../i18n";
import type { AnalyzeDeleteReport, ThreadRow } from "../../types";
import { ForensicsPanel } from "./ForensicsPanel";

const messages = getMessages("en");

const rows: ThreadRow[] = [
  {
    thread_id: "thread-1",
    title: "Cleanup candidate",
    risk_score: 54,
    risk_level: "medium",
    risk_tags: [],
    is_pinned: false,
    source: "sessions",
    timestamp: "2026-03-27T00:00:00.000Z",
    activity_status: "stale",
  },
];

const impactRows: AnalyzeDeleteReport[] = [
  {
    id: "thread-1",
    title: "Cleanup candidate",
    risk_level: "medium",
    risk_score: 54,
    summary: "Thread still has sidebar and local cache references.",
    parents: ["global-state:thread-titles", "workspace:/tmp/threadlens"],
    impacts: ["Removed from sidebar title metadata", "Local cache file will be removed"],
    exists: true,
  },
];

describe("ForensicsPanel impact list", () => {
  it("shows refs and changes for analyzed rows", () => {
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
        selectedImpactRows={impactRows}
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

    expect(html).toContain("Refs");
    expect(html).toContain("global-state:thread-titles");
    expect(html).toContain("Changes");
    expect(html).toContain("Removed from sidebar title metadata");
  });
});
