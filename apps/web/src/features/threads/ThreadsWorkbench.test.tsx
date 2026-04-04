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

vi.mock("../../app/AppContext", () => ({
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

    expect(html).toContain(messages.threadsTable.heroEyebrow);
    expect(html).toContain("Review &amp; Archive");
    expect(html).toContain(messages.threadsTable.heroBody);
    expect(html).toContain("dry-run");
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
});
