import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "@/i18n";
import type { ThreadRow } from "@/shared/types";
import { ThreadsTable, toggleSubsetSelectionState, toggleVisibleSelectionState } from "@/features/threads/components/ThreadsTable";

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
  {
    thread_id: "thread-archived-1234",
    title: "Archived cleanup candidate",
    risk_score: 26,
    risk_level: "low",
    risk_tags: [],
    is_pinned: false,
    source: "archived_sessions",
    timestamp: "2026-03-27T00:00:00.000Z",
    activity_status: "stale",
  },
];

describe("ThreadsTable", () => {
  it("renders cleanup-signal copy instead of risk-heavy labels", () => {
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
        dryRunReady={false}
        dryRunReadyIds={[]}
        busy={false}
        threadActionsDisabled={false}
        bulkArchive={vi.fn()}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
        cleanupExecute={vi.fn()}
        onRequestHardDeleteConfirm={vi.fn()}
        hardDeleteConfirmOpen={true}
        hardDeleteSkipConfirmChecked={false}
        onToggleHardDeleteSkipConfirmChecked={() => undefined}
        onConfirmHardDelete={() => undefined}
        onCancelHardDeleteConfirm={() => undefined}
      />,
    );

    expect(html).toContain("Signal");
    expect(html).toContain("Hard delete");
    expect(html).toContain("Delete selected thread files now?");
    expect(html).toContain("Do not ask again for hard delete.");
    expect(html).not.toContain("Toggle visible");
    expect(html).not.toContain("Select high signal only");
    expect(html).not.toContain("Select dry-run ready");
    expect(html).not.toContain("Select stale only");
    expect(html).not.toContain("Select pinned only");
    expect(html).not.toContain("Pin in Codex");
    expect(html).not.toContain("Unpin in Codex");
    expect(html).toContain("table-select-target");
    expect(html).toContain("aria-label=\"Select thread Review this cleanup candidate\"");
    expect(html).toContain(`aria-label="${messages.threadsTable.selectAllFiltered}"`);
    expect(html).not.toContain(`>${messages.threadsTable.selectAllFiltered}</label>`);
    expect(html).not.toContain("Clear visible selection");
    expect(html).toContain(">archive</td>");
  });

  it("toggles visible selection when all visible rows are already selected", () => {
    expect(toggleVisibleSelectionState(rows, {})).toEqual({
      "thread-1234567890": true,
      "thread-archived-1234": true,
    });

    expect(
      toggleVisibleSelectionState(rows, {
        "thread-1234567890": true,
        "thread-archived-1234": true,
      }),
    ).toEqual({
      "thread-1234567890": false,
      "thread-archived-1234": false,
    });
  });

  it("toggles subset-only selection off when the same stale subset is already active", () => {
    expect(
      toggleSubsetSelectionState(
        rows,
        {
          "thread-1234567890": true,
          "thread-archived-1234": true,
        },
        (row) => row.activity_status === "stale",
      ),
    ).toEqual({
      "thread-1234567890": false,
      "thread-archived-1234": false,
    });
  });

  it("renders localized thread-table labels for visible controls", () => {
    const deMessages = getMessages("de");
    const html = renderToStaticMarkup(
      <ThreadsTable
        messages={deMessages}
        visibleRows={rows}
        filteredRows={rows}
        totalCount={2}
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
        dryRunReady={false}
        dryRunReadyIds={[]}
        busy={false}
        threadActionsDisabled={false}
        bulkArchive={vi.fn()}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
        cleanupExecute={vi.fn()}
        onRequestHardDeleteConfirm={vi.fn()}
        hardDeleteConfirmOpen={false}
        hardDeleteSkipConfirmChecked={false}
        onToggleHardDeleteSkipConfirmChecked={() => undefined}
        onConfirmHardDelete={() => undefined}
        onCancelHardDeleteConfirm={() => undefined}
      />,
    );

    expect(html).toContain(`${deMessages.threadsTable.workflowSelectedTitle} 0`);
    expect(html).toContain(`${deMessages.threadsTable.workflowImpactTitle} ${deMessages.forensics.stagePending}`);
    expect(html).toContain(deMessages.threadsTable.bulkArchive);
    expect(html).toContain(deMessages.threadsTable.bulkImpact);
    expect(html).toContain(deMessages.threadsTable.bulkCleanupDryRun);
    expect(html).toContain(`aria-label="${deMessages.threadsTable.selectThreadAria.replace("{title}", "Review this cleanup candidate")}"`);
    expect(html).toContain(`aria-label="${deMessages.threadsTable.selectAllFiltered}"`);
    expect(html).toContain(`>${deMessages.threadsTable.colRisk}<`);
    expect(html).toContain(`>${deMessages.threadsTable.colPinned}<`);
  });

  it("renders localized thread row badge, fallback title, and source labels", () => {
    const deMessages = getMessages("de");
    const html = renderToStaticMarkup(
      <ThreadsTable
        messages={deMessages}
        visibleRows={[
          {
            thread_id: "thread-1234567890",
            title: "",
            risk_score: 82,
            risk_level: "high",
            risk_tags: ["orphan-candidate", "ctx-high"],
            is_pinned: false,
            source: "sessions",
            timestamp: "2026-03-27T00:00:00.000Z",
            activity_status: "stale",
          },
        ]}
        filteredRows={[
          {
            thread_id: "thread-1234567890",
            title: "",
            risk_score: 82,
            risk_level: "high",
            risk_tags: ["orphan-candidate", "ctx-high"],
            is_pinned: false,
            source: "sessions",
            timestamp: "2026-03-27T00:00:00.000Z",
            activity_status: "stale",
          },
        ]}
        totalCount={1}
        threadsLoading={false}
        threadsError={false}
        selected={{}}
        setSelected={vi.fn()}
        selectedThreadId="thread-1234567890"
        setSelectedThreadId={vi.fn()}
        allFilteredSelected={false}
        toggleSelectAllFiltered={vi.fn()}
        selectedIds={[]}
        selectedImpactCount={0}
        dryRunReady={false}
        dryRunReadyIds={[]}
        busy={false}
        threadActionsDisabled={false}
        bulkArchive={vi.fn()}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
        cleanupExecute={vi.fn()}
        onRequestHardDeleteConfirm={vi.fn()}
        hardDeleteConfirmOpen={false}
        hardDeleteSkipConfirmChecked={false}
        onToggleHardDeleteSkipConfirmChecked={() => undefined}
        onConfirmHardDelete={() => undefined}
        onCancelHardDeleteConfirm={() => undefined}
      />,
    );

    expect(html).toContain(`${deMessages.threadsTable.fallbackTitlePrefix} thread-1`);
    expect(html).toContain(`>${deMessages.threadsTable.sourceSessions}<`);
    expect(html).toContain("thread-table-title-text");
    expect(html).not.toContain(deMessages.threadsTable.currentSelection);
  });

  it("keeps workflow strip glossary in English for Simplified Chinese", () => {
    const zhMessages = getMessages("zh-CN");
    const html = renderToStaticMarkup(
      <ThreadsTable
        messages={zhMessages}
        visibleRows={rows}
        filteredRows={rows}
        totalCount={2}
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
        dryRunReady={false}
        dryRunReadyIds={[]}
        busy={false}
        threadActionsDisabled={false}
        bulkArchive={vi.fn()}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
        cleanupExecute={vi.fn()}
        onRequestHardDeleteConfirm={vi.fn()}
        hardDeleteConfirmOpen={false}
        hardDeleteSkipConfirmChecked={false}
        onToggleHardDeleteSkipConfirmChecked={() => undefined}
        onConfirmHardDelete={() => undefined}
        onCancelHardDeleteConfirm={() => undefined}
      />,
    );

    expect(html).toContain(`${zhMessages.threadsTable.workflowSelectedTitle} 0`);
    expect(html).toContain(`${zhMessages.threadsTable.workflowImpactTitle} ${zhMessages.forensics.stagePending}`);
    expect(html).not.toContain("Cleanup dry-run Pending");
    expect(html).not.toContain("清理dry-runun");
    expect(html).not.toContain("气氛");
  });

  it("renders hard delete confirmation copy in Korean", () => {
    const koMessages = getMessages("ko");
    const html = renderToStaticMarkup(
      <ThreadsTable
        messages={koMessages}
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
        dryRunReady={false}
        dryRunReadyIds={[]}
        busy={false}
        threadActionsDisabled={false}
        bulkArchive={vi.fn()}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
        cleanupExecute={vi.fn()}
        onRequestHardDeleteConfirm={vi.fn()}
        hardDeleteConfirmOpen={true}
        hardDeleteSkipConfirmChecked={false}
        onToggleHardDeleteSkipConfirmChecked={() => undefined}
        onConfirmHardDelete={() => undefined}
        onCancelHardDeleteConfirm={() => undefined}
      />,
    );

    expect(html).toContain(koMessages.threadsTable.bulkCleanupExecute);
    expect(html).toContain(koMessages.threadsTable.hardDeleteConfirmTitle);
    expect(html).toContain(koMessages.threadsTable.hardDeleteConfirmSkipFuture);
    expect(html).toContain(koMessages.threadsTable.hardDeleteConfirmExecute);
    expect(html).not.toContain("Do not ask again for hard delete.");
  });
});
