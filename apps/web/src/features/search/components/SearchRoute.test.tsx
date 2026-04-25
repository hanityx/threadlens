import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { ConversationSearchHit } from "@/shared/types";
import { SearchRoute } from "@/features/search/components/SearchRoute";
import { AppContext, type AppContextValue } from "@/app/AppContext";
import { getMessages } from "@/i18n/catalog";
import { renderToStaticMarkup } from "react-dom/server";

const mockSearchPanel = vi.fn();

vi.mock("@/features/search/components/SearchPanel", () => ({
  SearchPanel: (props: unknown) => {
    mockSearchPanel(props);
    return <div data-testid="search-panel">search-panel</div>;
  },
}));

function buildContext(overrides: Partial<AppContextValue> = {}): AppContextValue {
  return {
    messages: getMessages("en"),
    locale: "en",
    setLocale: () => undefined,
    providersDiagnosticsOpen: false,
    setProvidersDiagnosticsOpen: () => undefined,
    setupGuideOpen: false,
    setSetupGuideOpen: () => undefined,
    headerSearchDraft: "",
    setHeaderSearchDraft: () => undefined,
    headerSearchSeed: "cleanup",
    setHeaderSearchSeed: () => undefined,
    searchThreadContext: null,
    setSearchThreadContext: () => undefined,
    providerProbeFilterIntent: null,
    setProviderProbeFilterIntent: () => undefined,
    acknowledgedForensicsErrorKeys: { analyze: "", cleanup: "" },
    setAcknowledgedForensicsErrorKeys: () => ({ analyze: "", cleanup: "" }),
    changeLayoutView: () => undefined,
    changeProviderView: () => undefined,
    openProvidersHome: () => undefined,
    showRuntimeBackendDegraded: false,
    emptySessionScopeLabel: "All Providers",
    analyzeErrorKey: "",
    cleanupErrorKey: "",
    runtimeBackend: undefined,
    threadSearchInputRef: { current: null },
    detailLayoutRef: { current: null },
    setLayoutView: () => undefined,
    searchProviderOptions: [
      { id: "codex", name: "Codex" },
      { id: "claude", name: "Claude" },
    ],
    setSelectedThreadId: () => undefined,
    setSelectedSessionPath: () => undefined,
    setProviderView: () => undefined,
    ...overrides,
  } as unknown as AppContextValue;
}

describe("SearchRoute", () => {
  beforeEach(() => {
    mockSearchPanel.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes current search seed and provider options into SearchPanel", () => {
    const html = renderToStaticMarkup(
      <AppContext.Provider value={buildContext()}>
        <SearchRoute />
      </AppContext.Provider>,
    );

    expect(mockSearchPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        initialQuery: "cleanup",
        providerOptions: [
          { id: "codex", name: "Codex" },
          { id: "claude", name: "Claude" },
        ],
      }),
    );
    expect(html).toContain("search-panel");
  });

  it("routes session hits into providers layout and clears thread state", () => {
    const setProviderView = vi.fn();
    const setSearchThreadContext = vi.fn();
    const setSelectedThreadId = vi.fn();
    const setSelectedSessionPath = vi.fn();
    const setLayoutView = vi.fn();
    const pushState = vi.fn();
    vi.stubGlobal("window", {
      location: {
        search: "?view=search",
        pathname: "/",
        hash: "",
      },
      history: {
        pushState,
      },
    });
    renderToStaticMarkup(
      <AppContext.Provider
        value={buildContext({
          setProviderView,
          setSearchThreadContext,
          setSelectedThreadId,
          setSelectedSessionPath,
          setLayoutView,
        })}
      >
        <SearchRoute />
      </AppContext.Provider>,
    );

    const props = mockSearchPanel.mock.calls[0]?.[0] as {
      onOpenSession: (hit: ConversationSearchHit) => void;
    };
    props.onOpenSession({
      provider: "codex",
      file_path: "/tmp/session.jsonl",
      thread_id: "thread-1",
    } as ConversationSearchHit);

    expect(setProviderView).toHaveBeenCalledWith("codex");
    expect(setSearchThreadContext).toHaveBeenCalledWith(null);
    expect(setSelectedThreadId).toHaveBeenCalledWith("");
    expect(setSelectedSessionPath).toHaveBeenCalledWith("/tmp/session.jsonl");
    expect(setLayoutView).toHaveBeenCalledWith("providers");
    expect(pushState).toHaveBeenCalledWith(
      null,
      "",
      "/?view=providers&provider=codex&filePath=%2Ftmp%2Fsession.jsonl",
    );
  });

  it("routes thread hits into threads layout and ignores hits without thread ids", () => {
    const setSearchThreadContext = vi.fn();
    const setSelectedSessionPath = vi.fn();
    const setSelectedThreadId = vi.fn();
    const setLayoutView = vi.fn();
    renderToStaticMarkup(
      <AppContext.Provider
        value={buildContext({
          setSearchThreadContext,
          setSelectedSessionPath,
          setSelectedThreadId,
          setLayoutView,
        })}
      >
        <SearchRoute />
      </AppContext.Provider>,
    );

    const props = mockSearchPanel.mock.calls[0]?.[0] as {
      onOpenThread: (hit: ConversationSearchHit) => void;
    };
    props.onOpenThread({ provider: "codex" } as ConversationSearchHit);
    expect(setLayoutView).not.toHaveBeenCalled();

    const hit = {
      provider: "codex",
      thread_id: "thread-42",
      file_path: "/tmp/session.jsonl",
    } as ConversationSearchHit;
    props.onOpenThread(hit);

    expect(setSearchThreadContext).toHaveBeenCalledWith(hit);
    expect(setSelectedSessionPath).toHaveBeenCalledWith("");
    expect(setSelectedThreadId).toHaveBeenCalledWith("thread-42");
    expect(setLayoutView).toHaveBeenCalledWith("threads");
  });
});
