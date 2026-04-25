import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "@/i18n/catalog";
import type { ThreadRow } from "@/shared/types";
import { ThreadsTable } from "@/features/threads/components/ThreadsTable";
import {
  buildThreadRowKey,
  resolveNextThreadSort,
  resolveVisibleThreadSelectionCount,
  toggleThreadRowSelectionState,
  toggleSubsetSelectionState,
  toggleVisibleSelectionState,
} from "@/features/threads/model/threadsTableModel";

const messages = getMessages("en");

const rows: ThreadRow[] = [
  {
    thread_id: "thread-1234567890",
    title: "Review this cleanup candidate",
    risk_score: 82,
    risk_level: "high",
    risk_tags: ["orphan-candidate", "ctx-high"],
    is_pinned: true,
    source: "sessions",
    timestamp: "2026-03-27T00:00:00.000Z",
    activity_status: "stale",
    activity_age_min: 60 * 24 * 12,
    session_line_count: 240,
    session_tool_calls: 8,
    context_score: 78,
    has_local_data: true,
    has_session_log: false,
    cwd: "/workspace/threadlens",
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
    activity_age_min: 60 * 24 * 7,
    session_line_count: 32,
    session_tool_calls: 0,
    context_score: 18,
    has_local_data: false,
    has_session_log: true,
    cwd: "/workspace/threadlens-old",
  },
];

describe("ThreadsTable", () => {
  it("toggles signal sorting between high-first and low-first order", () => {
    expect(resolveNextThreadSort("updated_desc")).toBe("risk_desc");
    expect(resolveNextThreadSort("risk_desc")).toBe("risk_asc");
    expect(resolveNextThreadSort("risk_asc")).toBe("risk_desc");
    expect(resolveNextThreadSort("updated_desc", "activity")).toBe("activity_asc");
    expect(resolveNextThreadSort("activity_asc", "activity")).toBe("activity_desc");
    expect(resolveNextThreadSort("updated_desc", "cwd")).toBe("cwd_desc");
    expect(resolveNextThreadSort("cwd_desc", "cwd")).toBe("cwd_asc");
    expect(resolveNextThreadSort("updated_desc", "pinned")).toBe("pinned_desc");
    expect(resolveNextThreadSort("pinned_desc", "pinned")).toBe("pinned_asc");
  });

  it("renders the activity and cwd columns, signal sort state, and load-more control", () => {
    const html = renderToStaticMarkup(
      <ThreadsTable
        messages={messages}
        visibleRows={rows}
        filteredRows={rows}
        totalCount={160}
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
        threadSort="risk_desc"
        onThreadSortChange={vi.fn()}
        showBackupRows={false}
        canShowBackupRows={true}
        onToggleShowBackupRows={vi.fn()}
        showArchivedRows={false}
        canShowArchivedRows={true}
        onToggleShowArchivedRows={vi.fn()}
        hasMoreRows={true}
        onLoadMoreRows={vi.fn()}
      />,
    );

    expect(html).toContain(messages.threadsTable.colActivity);
    expect(html).toContain(messages.threadsTable.colWorkspace);
    expect(html).toContain(messages.threadsTable.colPinned);
    expect(html).toContain("12d ago");
    expect(html).not.toContain("12d ago · stale");
    expect(html).toContain("threadlens");
    expect(html).toContain("✓");
    expect(html).toContain(">-</span>");
    expect(html).not.toContain(">Yes</td>");
    expect(html).not.toContain(">No</td>");
    expect(html).toContain("Mar 27, 2026");
    expect(html).toContain('aria-sort="descending"');
    expect(html).toContain('class="table-sort-button"');
    expect(html).toContain('class="sub-toolbar table-load-more-bar"');
    expect(html).toContain(`${messages.threadsTable.loadMoreRows} 2/160`);
    expect(html).toContain(messages.threadsTable.showBackupRows);
    expect(html).toContain("Archived");
    expect(html).toContain("sessions-action-tools");
    expect(html).toContain("sessions-action-tool-btn");
    expect(html).toContain("aria-sort=\"none\"");
  });

  it("marks Activity, CWD, and Pin headers as sortable", () => {
    const html = renderToStaticMarkup(
      <ThreadsTable
        messages={messages}
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
        threadSort="activity_asc"
        onThreadSortChange={vi.fn()}
      />,
    );

    expect(html).toContain(`${messages.threadsTable.colActivity}<span class=\"col-sort-indicator\">▲</span>`);
    expect(html).toContain(`>${messages.threadsTable.colWorkspace}`);
    expect(html).toContain(`>${messages.threadsTable.colPinned}`);
  });

  it("keeps only hard delete enabled for selected backup rows", () => {
    const html = renderToStaticMarkup(
      <ThreadsTable
        messages={messages}
        visibleRows={[{ ...rows[0], source: "cleanup_backups" }]}
        filteredRows={[{ ...rows[0], source: "cleanup_backups" }]}
        totalCount={1}
        threadsLoading={false}
        threadsError={false}
        selected={{ [rows[0].thread_id]: true }}
        setSelected={vi.fn()}
        selectedThreadId=""
        setSelectedThreadId={vi.fn()}
        allFilteredSelected={true}
        toggleSelectAllFiltered={vi.fn()}
        selectedIds={[rows[0].thread_id]}
        selectedImpactCount={0}
        dryRunReady={true}
        dryRunReadyIds={[rows[0].thread_id]}
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
        showBackupRows={true}
        canShowBackupRows={true}
      />,
    );

    expect(html).not.toContain("recovery copies");
    expect(html.match(/disabled=""/g)?.length).toBe(3);
  });

  it("keeps the signal column compact and score-only", () => {
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
    expect(html).toContain(">82</div>");
    expect(html).not.toContain("Orphan candidate");
    expect(html).not.toContain("High context");
    expect(html).not.toContain("~240 msgs");
    expect(html).not.toContain("~8 tools");
    expect(html).not.toContain("ctx 78");
    expect(html).toContain("Hard delete");
    expect(html).toContain("Delete selected thread files now?");
    expect(html).toContain("Do not ask again for hard delete.");
    expect(html).not.toContain("Toggle visible");
    expect(html).not.toContain("Select high signal only");
    expect(html).not.toContain("Select dry-run ready");
    expect(html).not.toContain("Select stale only");
    expect(html).not.toContain("Select pinned only");
    expect(html).not.toContain("Backups");
    expect(html).not.toContain("Pin in Codex");
    expect(html).not.toContain("Unpin in Codex");
    expect(html).toContain("table-select-target");
    expect(html).toContain("aria-label=\"Select thread Review this cleanup candidate\"");
    expect(html).toContain(`aria-label="${messages.threadsTable.selectAllFiltered}"`);
    expect(html).not.toContain(`>${messages.threadsTable.selectAllFiltered}</label>`);
    expect(html).not.toContain("Clear visible selection");
    expect(html).toContain("archive");
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

  it("toggles the clicked thread row selection without dropping other selections", () => {
    expect(toggleThreadRowSelectionState({}, "thread-1234567890")).toEqual({
      "thread-1234567890": true,
    });

    expect(
      toggleThreadRowSelectionState(
        {
          "thread-1234567890": true,
          "thread-archived-1234": true,
        },
        "thread-1234567890",
      ),
    ).toEqual({
      "thread-1234567890": false,
      "thread-archived-1234": true,
    });
  });

  it("builds unique React row keys for duplicate thread ids from different sources", () => {
    const duplicateRows: ThreadRow[] = [
      { ...rows[0], thread_id: "thread-duplicate", source: "sessions", timestamp: "2026-03-27T00:00:00.000Z" },
      { ...rows[0], thread_id: "thread-duplicate", source: "cleanup_backups", timestamp: "2026-03-27T00:00:00.000Z" },
      { ...rows[0], thread_id: "thread-duplicate", source: "cleanup_backups", timestamp: "2026-03-27T00:00:00.000Z" },
    ];

    const keys = duplicateRows.map((row, index) => buildThreadRowKey(row, index));

    expect(new Set(keys).size).toBe(duplicateRows.length);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[1]).not.toBe(keys[2]);
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

  it("counts only checkbox-selected threads, not the focused detail row", () => {
    expect(resolveVisibleThreadSelectionCount(rows, [], "thread-1234567890")).toBe(0);
    expect(resolveVisibleThreadSelectionCount(rows, [], "missing-thread")).toBe(0);
    expect(resolveVisibleThreadSelectionCount(rows, ["thread-archived-1234"], "thread-1234567890")).toBe(1);
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
    expect(html).not.toContain(`${deMessages.threadsTable.workflowImpactTitle} ${deMessages.threadsTable.workflowImpactPending}`);
    expect(html).not.toContain(`${deMessages.threadsTable.workflowDryRunTitle} ${deMessages.threadsTable.workflowDryRunPending}`);
    expect(html).toContain(deMessages.threadsTable.bulkArchive);
    expect(html).toContain(deMessages.threadsTable.bulkImpact);
    expect(html).toContain(deMessages.threadsTable.bulkCleanupDryRun);
    expect(html).toContain(`aria-label="${deMessages.threadsTable.selectThreadAria.replace("{title}", "Review this cleanup candidate")}"`);
    expect(html).toContain(`aria-label="${deMessages.threadsTable.selectAllFiltered}"`);
    expect(html).toContain(`>${deMessages.threadsTable.colRisk}<`);
    expect(html).toContain(`>${deMessages.threadsTable.colPinned}<`);
  });

  it("labels the archive action as unarchive in archived-row mode", () => {
    const koMessages = getMessages("ko");
    const html = renderToStaticMarkup(
      <ThreadsTable
        messages={koMessages}
        visibleRows={rows}
        filteredRows={rows}
        totalCount={2}
        threadsLoading={false}
        threadsError={false}
        selected={{ "thread-archived-1234": true }}
        setSelected={vi.fn()}
        selectedThreadId=""
        setSelectedThreadId={vi.fn()}
        allFilteredSelected={false}
        toggleSelectAllFiltered={vi.fn()}
        selectedIds={["thread-archived-1234"]}
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
        showArchivedRows={true}
      />,
    );

    expect(html).toContain(koMessages.threadsTable.bulkUnarchive);
    expect(html).not.toContain(`>${koMessages.threadsTable.bulkArchive}<`);
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
            activity_age_min: 60 * 24 * 12,
            session_line_count: 240,
            session_tool_calls: 8,
            context_score: 78,
            has_local_data: true,
            has_session_log: false,
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
            activity_age_min: 60 * 24 * 12,
            session_line_count: 240,
            session_tool_calls: 8,
            context_score: 78,
            has_local_data: true,
            has_session_log: false,
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
    expect(html).toContain(deMessages.threadsTable.sourceSessions);
    expect(html).toContain(`${deMessages.threadsTable.workflowSelectedTitle} 0`);
    expect(html).toContain("thread-table-title-text");
    expect(html).not.toContain(deMessages.threadsTable.currentSelection);
  });

  it("uses localized workflow strip labels", () => {
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
    expect(html).not.toContain(`${zhMessages.threadsTable.workflowImpactTitle} ${zhMessages.threadsTable.workflowImpactPending}`);
    expect(html).not.toContain(`${zhMessages.threadsTable.workflowDryRunTitle} ${zhMessages.threadsTable.workflowDryRunPending}`);
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

    expect(html).toContain("강제 삭제");
    expect(html).toContain("선택한 스레드 파일을 지금 강제 삭제할까요?");
    expect(html).toContain("앞으로 강제 삭제 확인을 다시 묻지 않기");
    expect(html).toContain("지금 강제 삭제");
    expect(html).not.toContain("Orphan 후보");
    expect(html).not.toContain("컨텍스트 큼");
    expect(html).not.toContain("Do not ask again for hard delete.");
  });

  it("explains why Korean hard delete stays disabled before delete preview", () => {
    const koMessages = getMessages("ko");
    const html = renderToStaticMarkup(
      <ThreadsTable
        messages={koMessages}
        visibleRows={rows}
        filteredRows={rows}
        totalCount={1}
        threadsLoading={false}
        threadsError={false}
        selected={{ "thread-1234567890": true }}
        setSelected={vi.fn()}
        selectedThreadId=""
        setSelectedThreadId={vi.fn()}
        allFilteredSelected={false}
        toggleSelectAllFiltered={vi.fn()}
        selectedIds={["thread-1234567890"]}
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

    expect(html).toContain("삭제 준비");
    expect(html).toContain('title="삭제 준비를 먼저 실행하면 강제 삭제가 활성화됩니다."');
    expect(html).toContain("disabled");
  });
});
