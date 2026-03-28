import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMessages } from "../../i18n";
import { ThreadsWorkbench } from "./ThreadsWorkbench";

const mockUseAppContext = vi.fn();
const mockThreadsTable = vi.fn((props: Record<string, unknown>) => (
  <div data-slot="threads-table">
    {String(props.selectedImpactCount ?? "")}
    {"|"}
    {String(Boolean(props.dryRunReady))}
  </div>
));
const mockThreadDetailSlot = vi.fn((props: Record<string, unknown>) => {
  const cleanupData =
    props.cleanupData && typeof props.cleanupData === "object"
      ? (props.cleanupData as { confirm_token_expected?: string | null })
      : null;
  const pendingCleanup =
    props.pendingCleanup && typeof props.pendingCleanup === "object"
      ? (props.pendingCleanup as { confirmToken?: string | null })
      : null;
  return (
    <div data-slot="thread-detail">
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

vi.mock("../../app/AppContext", () => ({
  useAppContext: () => mockUseAppContext(),
}));

vi.mock("./ThreadsTable", () => ({
  ThreadsTable: (props: Record<string, unknown>) => mockThreadsTable(props),
}));

vi.mock("./ThreadDetailSlot", () => ({
  ThreadDetailSlot: (props: Record<string, unknown>) => mockThreadDetailSlot(props),
}));

const messages = getMessages("en");

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
    visibleRows: [],
    filteredRows: [],
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
    analyzeDelete: vi.fn(),
    cleanupDryRun: vi.fn(),
    cleanupExecute: vi.fn(),
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

describe("ThreadsWorkbench", () => {
  beforeEach(() => {
    mockThreadDetailSlot.mockClear();
    mockThreadsTable.mockClear();
    mockUseAppContext.mockReturnValue(buildContext());
  });

  it("forwards cleanup review state into the thread detail slot", () => {
    const html = renderToStaticMarkup(<ThreadsWorkbench />);

    expect(html).toContain("data-slot=\"thread-detail\"");
    expect(mockThreadDetailSlot).toHaveBeenCalledTimes(1);
    expect(mockThreadsTable).toHaveBeenCalledTimes(1);
    expect(html).toContain("data-slot=\"threads-table\">1|false</div>");
    expect(html).toContain("token-123|token-123|true|1|true|true|analysis failed|cleanup failed|execute failed");
  });

  it("marks dry-run as not ready when the selected ids no longer match the pending token", () => {
    mockUseAppContext.mockReturnValue(
      buildContext({
        selectedIds: ["thread-2"],
        selectedThreadId: "",
      }),
    );

    renderToStaticMarkup(<ThreadsWorkbench />);

    expect(mockThreadsTable).toHaveBeenCalledTimes(1);
    const props = mockThreadsTable.mock.calls[0]?.[0] as { dryRunReady?: boolean };
    expect(props.dryRunReady).toBe(false);
  });
});
