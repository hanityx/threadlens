import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMessages } from "@/i18n/catalog";
import { ThreadsWorkbench } from "@/features/threads/components/ThreadsWorkbench";
import { resolveThreadWorkbenchPanelHeight } from "@/features/threads/model/threadsWorkbenchModel";

const mockUseAppContext = vi.fn();
const mockThreadsTable = vi.fn((props: Record<string, unknown>) => (
  <div data-slot="threads-table">
    {String(props.selectedImpactCount ?? "")}
    {"|"}
    {String(Boolean(props.dryRunReady))}
  </div>
));
const mockThreadDetailSlot = vi.fn((props: Record<string, unknown>) => {
  return (
    <div data-slot="thread-detail">
      {String(props.selectedThreadId ?? "")}
      {"|"}
      {String(Array.isArray(props.selectedIds) ? props.selectedIds.length : 0)}
    </div>
  );
});
const mockThreadsForensicsSlot = vi.fn((props: Record<string, unknown>) => {
  const cleanupData =
    props.cleanupData && typeof props.cleanupData === "object"
      ? (props.cleanupData as { confirm_token_expected?: string | null })
      : null;
  const pendingCleanup =
    props.pendingCleanup && typeof props.pendingCleanup === "object"
      ? (props.pendingCleanup as { confirmToken?: string | null })
      : null;
  return (
    <div data-slot="thread-forensics">
      {cleanupData?.confirm_token_expected ?? ""}
      {"|"}
      {pendingCleanup?.confirmToken ?? ""}
      {"|"}
      {String(typeof props.cleanupExecute === "function")}
      {"|"}
      {Array.isArray(props.selectedImpactRows) ? props.selectedImpactRows.length : 0}
      {"|"}
      {String(Boolean(props.analysisRaw))}
      {"|"}
      {String(Boolean(props.cleanupRaw))}
      {"|"}
      {String(props.analyzeDeleteErrorMessage ?? "")}
      {"|"}
      {String(props.cleanupDryRunErrorMessage ?? "")}
      {"|"}
      {String(props.cleanupExecuteErrorMessage ?? "")}
    </div>
  );
});

vi.mock("@/app/AppContext", () => ({
  useAppContext: () => mockUseAppContext(),
}));

vi.mock("./ThreadsTable", () => ({
  ThreadsTable: (props: Record<string, unknown>) => mockThreadsTable(props),
}));

vi.mock("./ThreadDetailSlot", () => ({
  ThreadDetailSlot: (props: Record<string, unknown>) => mockThreadDetailSlot(props),
}));
vi.mock("./ThreadsForensicsSlot", () => ({
  ThreadsForensicsSlot: (props: Record<string, unknown>) => mockThreadsForensicsSlot(props),
}));

const messages = getMessages("en");
const baseVisibleThread = {
  thread_id: "thread-1",
  title: "Thread 1",
  risk_score: 48,
  risk_level: "medium",
  is_pinned: false,
  source: "sessions",
  timestamp: "2026-03-27T00:00:00.000Z",
};

function buildContext(overrides: Record<string, unknown> = {}) {
  return {
    messages,
    threadSearchInputRef: { current: null },
    query: "",
    setQuery: vi.fn(),
    filterMode: "all",
    setFilterMode: vi.fn(),
    threadsFetchMs: null,
    threadsFastBooting: false,
    visibleRows: [baseVisibleThread],
    filteredRows: [baseVisibleThread],
    selectedIds: [],
    cleanupData: { confirm_token_expected: "token-123" },
    pendingCleanup: {
      ids: ["thread-1"],
      confirmToken: "token-123",
      selectionKey: 'thread-1::{"delete_cache":true,"delete_session_logs":true,"clean_state_refs":true}',
    },
    selectedImpactRows: [],
    analysisData: { reports: [{ id: "thread-1", risk_level: "medium", risk_score: 48, title: "Thread 1" }] },
    analysisRaw: { ok: true },
    cleanupRaw: { ok: true },
    showForensics: true,
    threads: { data: { total: 1 } },
    threadsLoading: false,
    selected: {},
    setSelected: vi.fn(),
    selectedThreadId: "thread-1",
    setSelectedThreadId: vi.fn(),
    allFilteredSelected: false,
    toggleSelectAllFiltered: vi.fn(),
    busy: false,
    showRuntimeBackendDegraded: false,
    bulkPin: vi.fn(),
    bulkUnpin: vi.fn(),
    bulkArchive: vi.fn(),
    bulkUnarchive: vi.fn(),
    analyzeDelete: vi.fn(),
    cleanupDryRun: vi.fn(),
    cleanupExecute: vi.fn(),
    cleanupBackupsExecute: vi.fn(),
    analyzeDeleteError: true,
    cleanupDryRunError: true,
    cleanupExecuteError: true,
    analyzeDeleteErrorMessage: "analysis failed",
    cleanupDryRunErrorMessage: "cleanup failed",
    cleanupExecuteErrorMessage: "execute failed",
    selectedThread: null,
    highRiskCount: 0,
    recentThreadTitle: vi.fn(() => "recent thread"),
    searchThreadContext: null,
    threadDetailLoading: false,
    selectedThreadDetail: null,
    threadTranscriptData: null,
    threadTranscriptLoading: false,
    threadTranscriptLimit: 250,
    setThreadTranscriptLimit: vi.fn(),
    rows: [],
    ...overrides,
  };
}

function getThreadsTableProps() {
  return mockThreadsTable.mock.calls[0]?.[0] as {
    bulkArchive?: (ids: string[]) => void;
    analyzeDelete?: (ids: string[]) => void;
    cleanupDryRun?: (ids: string[]) => void;
    onRequestHardDeleteConfirm?: () => void;
    onConfirmHardDelete?: () => void;
    showBackupRows?: boolean;
    showArchivedRows?: boolean;
    canShowArchivedRows?: boolean;
    onToggleShowBackupRows?: () => void;
    onToggleShowArchivedRows?: () => void;
  };
}

function getThreadDetailProps() {
  return mockThreadDetailSlot.mock.calls[0]?.[0] as {
    analyzeDelete?: (ids: string[]) => void;
    openThreadFolder?: (id: string) => void;
  };
}

describe("ThreadsWorkbench", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockThreadDetailSlot.mockClear();
    mockThreadsForensicsSlot.mockClear();
    mockThreadsTable.mockClear();
    mockUseAppContext.mockReturnValue(buildContext());
  });

  it("forwards cleanup review state into the thread detail slot", () => {
    const html = renderToStaticMarkup(<ThreadsWorkbench />);

    expect(html).toContain("ops-layout is-thread-active");
    expect(html).toContain("thread-side-stack");
    expect(html).toContain("data-slot=\"thread-detail\"");
    expect(html).toContain("data-slot=\"thread-forensics\"");
    expect(mockThreadDetailSlot).toHaveBeenCalledTimes(1);
    expect(mockThreadsForensicsSlot).toHaveBeenCalledTimes(1);
    expect(mockThreadsTable).toHaveBeenCalledTimes(1);
    expect(html).toContain("data-slot=\"threads-table\">1|false</div>");
    expect(html).toContain("data-slot=\"thread-detail\">thread-1|0</div>");
    expect(html).toContain("token-123|token-123|true|1|true|true|analysis failed|cleanup failed|execute failed");
  });

  it("does not count the focused thread as an explicit selection", () => {
    const html = renderToStaticMarkup(<ThreadsWorkbench />);

    expect(html).not.toMatch(/<span>selected<\/span><strong>1<\/strong>/i);
  });

  it("marks dry-run as not ready when the selected ids no longer match the pending token", () => {
    mockUseAppContext.mockReturnValue(
      buildContext({
        selectedIds: ["thread-2"],
        selectedThreadId: "",
      }),
    );

    const html = renderToStaticMarkup(<ThreadsWorkbench />);

    expect(html).not.toContain("ops-layout is-thread-active");
    expect(mockThreadsTable).toHaveBeenCalledTimes(1);
    expect(mockThreadsForensicsSlot).toHaveBeenCalledTimes(1);
    const props = mockThreadsTable.mock.calls[0]?.[0] as { dryRunReady?: boolean };
    expect(props.dryRunReady).toBe(false);
  });

  it("does not treat a filtered-out focused thread as an active review target", () => {
    mockUseAppContext.mockReturnValue(
      buildContext({
        filteredRows: [],
        visibleRows: [],
        selectedIds: [],
      }),
    );

    renderToStaticMarkup(<ThreadsWorkbench />);

    const props = mockThreadsTable.mock.calls[0]?.[0] as {
      dryRunReady?: boolean;
      selectedImpactCount?: number;
    };
    expect(props.dryRunReady).toBe(false);
    expect(props.selectedImpactCount).toBe(0);
  });

  it("prefers the highest-risk visible row for the empty cleanup candidate", () => {
    mockUseAppContext.mockReturnValue(
      buildContext({
        selectedThreadId: "",
        selectedIds: [],
        visibleRows: [
          {
            thread_id: "thread-low",
            title: "Low risk",
            risk_score: 20,
            risk_level: "low",
            is_pinned: false,
            source: "sessions",
            timestamp: "2026-03-27T00:00:00.000Z",
          },
          {
            thread_id: "thread-high",
            title: "High risk",
            risk_score: 91,
            risk_level: "high",
            is_pinned: false,
            source: "history",
            timestamp: "2026-03-26T00:00:00.000Z",
          },
        ],
        recentThreadTitle: vi.fn((row) => String((row as { title?: string }).title ?? "")),
      }),
    );

    renderToStaticMarkup(<ThreadsWorkbench />);

    const props = mockThreadDetailSlot.mock.calls[0]?.[0] as {
      nextThreadId?: string;
      nextThreadTitle?: string;
      nextThreadSource?: string;
    };
    expect(props.nextThreadId).toBe("thread-high");
    expect(props.nextThreadTitle).toBe("High risk");
    expect(props.nextThreadSource).toBe("history · risk 91 · high");
  });

  it("renders localized thread workbench header copy in Indonesian", () => {
    const messages = getMessages("id");
    mockUseAppContext.mockReturnValue(
      buildContext({
        messages,
      }),
    );

    const html = renderToStaticMarkup(<ThreadsWorkbench />);

    expect(html).toContain("Review &amp; Archive");
    expect(html).not.toContain("overview-note-label");
    expect(html).toContain(messages.threadsTable.heroBody);
    expect(html).not.toContain(messages.threadsTable.heroStatDryRun);
    expect(html).toContain(messages.toolbar.searchThreads);
    expect(html).toContain(`>${messages.toolbar.all}<`);
    expect(html).toContain(`>${messages.toolbar.highRisk}<`);
    expect(html).toContain(`>${messages.toolbar.pinned}<`);
  });

  it("localizes the next thread source summary for Indonesian", () => {
    const messages = getMessages("id");
    mockUseAppContext.mockReturnValue(
      buildContext({
        messages,
        selectedThreadId: "",
        selectedIds: [],
        visibleRows: [
          {
            thread_id: "thread-high",
            title: "High risk",
            risk_score: 91,
            risk_level: "high",
            is_pinned: false,
            source: "history",
            timestamp: "2026-03-26T00:00:00.000Z",
          },
        ],
        recentThreadTitle: vi.fn((row) => String((row as { title?: string }).title ?? "")),
      }),
    );

    renderToStaticMarkup(<ThreadsWorkbench />);

    const props = mockThreadDetailSlot.mock.calls[0]?.[0] as {
      nextThreadSource?: string;
    };
    expect(props.nextThreadSource).toBe(
      messages.threadDetail.nextThreadSourceTemplate
        .replace("{source}", messages.threadsTable.sourceHistory)
        .replace("{score}", "91")
        .replace("{risk}", messages.overview.reviewRiskHigh),
    );
  });

  it("focuses the single selected thread before running impact analysis or cleanup dry-run", () => {
    const setSelectedThreadId = vi.fn();
    const analyzeDelete = vi.fn();
    const cleanupDryRun = vi.fn();
    mockUseAppContext.mockReturnValue(
      buildContext({
        selectedThreadId: "",
        selectedIds: ["thread-2"],
        setSelectedThreadId,
        analyzeDelete,
        cleanupDryRun,
      }),
    );

    renderToStaticMarkup(<ThreadsWorkbench />);
    const props = getThreadsTableProps();

    props.analyzeDelete?.(["thread-2"]);
    props.cleanupDryRun?.(["thread-2"]);

    expect(setSelectedThreadId).toHaveBeenNthCalledWith(1, "thread-2");
    expect(setSelectedThreadId).toHaveBeenNthCalledWith(2, "thread-2");
    expect(analyzeDelete).toHaveBeenCalledWith(["thread-2"], undefined);
    expect(cleanupDryRun).toHaveBeenCalledWith(["thread-2"]);
  });

  it("focuses the single selected thread before hard delete when skip-confirm is enabled", () => {
    const localStorage = {
      getItem: vi.fn((key: string) => (key === "po-thread-hard-delete-skip-confirm" ? "1" : null)),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    vi.stubGlobal("window", { localStorage });
    const setSelectedThreadId = vi.fn();
    const cleanupExecute = vi.fn();
    mockUseAppContext.mockReturnValue(
      buildContext({
        selectedThreadId: "",
        selectedIds: ["thread-2"],
        setSelectedThreadId,
        cleanupExecute,
      }),
    );

    renderToStaticMarkup(<ThreadsWorkbench />);
    const props = getThreadsTableProps();

    props.onRequestHardDeleteConfirm?.();

    expect(setSelectedThreadId).toHaveBeenCalledWith("thread-2");
    expect(cleanupExecute).toHaveBeenCalledWith(["thread-2"]);
  });

  it("runs backup cleanup, not normal cleanup, from the backup rows view", () => {
    const localStorage = {
      getItem: vi.fn((key: string) => (key === "po-thread-hard-delete-skip-confirm" ? "1" : null)),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    vi.stubGlobal("window", { localStorage });
    const cleanupExecute = vi.fn();
    const cleanupBackupsExecute = vi.fn();
    mockUseAppContext.mockReturnValue(
      buildContext({
        selectedThreadId: "",
        selectedIds: ["thread-backup"],
        showThreadBackupRows: true,
        cleanupExecute,
        cleanupBackupsExecute,
      }),
    );

    renderToStaticMarkup(<ThreadsWorkbench />);
    const props = getThreadsTableProps();

    props.onRequestHardDeleteConfirm?.();

    expect(cleanupBackupsExecute).toHaveBeenCalledWith(["thread-backup"]);
    expect(cleanupExecute).not.toHaveBeenCalled();
  });

  it("routes the archive button to unarchive while archived rows are shown", () => {
    const bulkArchive = vi.fn();
    const bulkUnarchive = vi.fn();
    mockUseAppContext.mockReturnValue(
      buildContext({
        selectedIds: ["thread-archived"],
        showThreadArchivedRows: true,
        bulkArchive,
        bulkUnarchive,
      }),
    );

    renderToStaticMarkup(<ThreadsWorkbench />);
    const props = getThreadsTableProps();

    props.bulkArchive?.(["thread-archived"]);

    expect(bulkUnarchive).toHaveBeenCalledWith(["thread-archived"]);
    expect(bulkArchive).not.toHaveBeenCalled();
  });

  it("keeps backup and archived source toggles mutually exclusive", () => {
    const setShowThreadBackupRows = vi.fn((value: boolean | ((prev: boolean) => boolean)) =>
      typeof value === "function" ? value(false) : value,
    );
    const setShowThreadArchivedRows = vi.fn((value: boolean | ((prev: boolean) => boolean)) =>
      typeof value === "function" ? value(false) : value,
    );
    mockUseAppContext.mockReturnValue(
      buildContext({
        hasThreadBackupRows: true,
        setShowThreadBackupRows,
        setShowThreadArchivedRows,
      }),
    );

    renderToStaticMarkup(<ThreadsWorkbench />);
    let props = getThreadsTableProps();
    expect(props.canShowArchivedRows).toBe(true);

    props.onToggleShowBackupRows?.();
    expect(setShowThreadBackupRows).toHaveBeenCalledTimes(1);
    expect(setShowThreadArchivedRows).toHaveBeenCalledWith(false);

    mockThreadsTable.mockClear();
    mockUseAppContext.mockReturnValue(
      buildContext({
        hasThreadBackupRows: true,
        setShowThreadBackupRows,
        setShowThreadArchivedRows,
      }),
    );
    renderToStaticMarkup(<ThreadsWorkbench />);
    props = getThreadsTableProps();

    props.onToggleShowArchivedRows?.();
    expect(setShowThreadArchivedRows).toHaveBeenCalledTimes(2);
    expect(setShowThreadBackupRows).toHaveBeenCalledWith(false);
  });

  it("keeps the detail action rail scoped to impact analysis and folder opening", () => {
    const analyzeDelete = vi.fn();
    mockUseAppContext.mockReturnValue(
      buildContext({
        selectedThreadId: "thread-1",
        selectedIds: [],
        analyzeDelete,
      }),
    );

    renderToStaticMarkup(<ThreadsWorkbench />);
    const props = getThreadDetailProps();

    expect(typeof props.analyzeDelete).toBe("function");
    expect(typeof props.openThreadFolder).toBe("function");
    expect("requestCleanupExecute" in props).toBe(false);
    expect("cleanupExecuteReady" in props).toBe(false);

    props.analyzeDelete?.(["thread-1"]);
    expect(analyzeDelete).toHaveBeenCalledWith(["thread-1"], undefined);
  });

  it("uses the stack height when it exceeds the minimum", () => {
    expect(
      resolveThreadWorkbenchPanelHeight({ stackHeight: 800 }),
    ).toBe(800);
  });

  it("uses the minimum height when the stack is shorter", () => {
    expect(
      resolveThreadWorkbenchPanelHeight({ stackHeight: 400 }),
    ).toBe(640);
  });

  it("uses the baseline height when it exceeds the current stack", () => {
    expect(
      resolveThreadWorkbenchPanelHeight({ stackHeight: 700, baselineHeight: 900 }),
    ).toBe(900);
  });

  it("uses the detail height when it is taller than the stack", () => {
    expect(
      resolveThreadWorkbenchPanelHeight({ stackHeight: 700, detailHeight: 850 }),
    ).toBe(850);
  });
});
