import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  buildDesktopRouteSearch,
  getFallbackProviderView,
  parseDesktopRouteSearch,
  resolveCanonicalExactProviderSessionMatch,
  shouldAutoScrollDetailIntoView,
  shouldApplyProviderFallback,
  shouldHandleGlobalSearchShortcut,
  shouldLookupRemoteExactThreadTarget,
  resolvePreferredProvidersEntry,
  resolveHeaderSearchTarget,
  shouldDeferProviderFallback,
  shouldDeferDesktopRouteSync,
  shouldPushDesktopRouteHistory,
  shouldRestoreRoutedSessionSelection,
  shouldRestoreRoutedThreadSelection,
  useAppShellBehavior,
} from "@/app/model/appShellBehavior";
import { SEARCH_PROVIDER_STORAGE_KEY } from "@/shared/lib/appState";
import type { ProviderSessionRow, ThreadRow } from "@/shared/types";

const providerRows: ProviderSessionRow[] = [
  {
    provider: "codex",
    source: "history",
    session_id: "019d0849-session-alpha",
    display_title: "Session alpha",
    file_path: "/tmp/codex/session-alpha.jsonl",
    size_bytes: 10,
    mtime: "2026-03-27T00:00:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: "Session alpha",
      title_source: "header",
    },
  },
  {
    provider: "claude",
    source: "history",
    session_id: "019d0849-session-beta",
    display_title: "Session beta",
    file_path: "/tmp/claude/session-beta.jsonl",
    size_bytes: 10,
    mtime: "2026-03-27T00:00:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: "Session beta",
      title_source: "header",
    },
  },
];

const threadRows: ThreadRow[] = [
  {
    thread_id: "thread-019d0849-alpha",
    title: "Alpha thread",
    source: "codex",
    risk_score: 0,
    is_pinned: false,
  },
];

describe("resolveHeaderSearchTarget", () => {
  it("opens a unique provider session prefix directly", () => {
    const target = resolveHeaderSearchTarget({
      query: "019d0849-session-a",
      visibleProviderIdSet: new Set(["all", "codex", "claude"]),
      providerSessionRows: providerRows,
      threadRows,
    });

    expect(target).toEqual({
      kind: "session",
      sessionId: "019d0849-session-alpha",
      filePath: "/tmp/codex/session-alpha.jsonl",
      providerView: "codex",
    });
  });

  it("falls back to all when the matched provider tab is hidden", () => {
    const target = resolveHeaderSearchTarget({
      query: "019d0849-session-b",
      visibleProviderIdSet: new Set(["all", "codex"]),
      providerSessionRows: providerRows,
      threadRows,
    });

    expect(target).toEqual({
      kind: "session",
      sessionId: "019d0849-session-beta",
      filePath: "/tmp/claude/session-beta.jsonl",
      providerView: "all",
    });
  });

  it("opens a unique thread prefix directly", () => {
    const target = resolveHeaderSearchTarget({
      query: "thread-019d0849",
      visibleProviderIdSet: new Set(["all", "codex"]),
      providerSessionRows: providerRows,
      threadRows,
    });

    expect(target).toEqual({
      kind: "thread",
      threadId: "thread-019d0849-alpha",
    });
  });

  it("prefers an exact thread id over an overlapping session id", () => {
    const overlappingProviderRows: ProviderSessionRow[] = [
      {
        ...providerRows[0],
        session_id: "thread-019d0849-alpha",
      },
    ];

    const target = resolveHeaderSearchTarget({
      query: "thread-019d0849-alpha",
      visibleProviderIdSet: new Set(["all", "codex"]),
      providerSessionRows: overlappingProviderRows,
      threadRows,
    });

    expect(target).toEqual({
      kind: "thread",
      threadId: "thread-019d0849-alpha",
    });
  });

  it("prefers an exact session id first in providers mode", () => {
    const target = resolveHeaderSearchTarget({
      query: "019d0849-session-alpha",
      visibleProviderIdSet: new Set(["all", "codex"]),
      providerSessionRows: providerRows,
      threadRows: [
        ...threadRows,
        {
          thread_id: "019d0849-session-alpha",
          title: "Overlapping thread",
          source: "codex",
          risk_score: 0,
          is_pinned: false,
        },
      ],
      preferSessionExactMatch: true,
    });

    expect(target).toEqual({
      kind: "session",
      sessionId: "019d0849-session-alpha",
      filePath: "/tmp/codex/session-alpha.jsonl",
      providerView: "codex",
    });
  });

  it("falls back to search when a prefix is ambiguous", () => {
    const target = resolveHeaderSearchTarget({
      query: "019d0849",
      visibleProviderIdSet: new Set(["all", "codex", "claude"]),
      providerSessionRows: providerRows,
      threadRows,
    });

    expect(target).toBeNull();
  });
});

describe("shouldLookupRemoteExactThreadTarget", () => {
  it("only flags exact thread-like tokens for remote lookup", () => {
    expect(shouldLookupRemoteExactThreadTarget("019d9c1d-774d-70a3-9fd6-83d13d3c6569")).toBe(true);
    expect(shouldLookupRemoteExactThreadTarget("thread-019d0849-alpha")).toBe(true);
    expect(shouldLookupRemoteExactThreadTarget("cleanup queue")).toBe(false);
    expect(shouldLookupRemoteExactThreadTarget("019d0849")).toBe(false);
  });
});

describe("shouldHandleGlobalSearchShortcut", () => {
  it("handles Cmd+K from non-text controls such as row checkboxes", () => {
    expect(
      shouldHandleGlobalSearchShortcut({
        key: "k",
        metaKey: true,
        target: { tagName: "INPUT", type: "checkbox" } as unknown as EventTarget,
      }),
    ).toBe(true);
    expect(
      shouldHandleGlobalSearchShortcut({
        key: "K",
        ctrlKey: true,
        target: { tagName: "BUTTON" } as unknown as EventTarget,
      }),
    ).toBe(true);
  });

  it("does not steal Cmd+K from editable text fields", () => {
    expect(
      shouldHandleGlobalSearchShortcut({
        key: "k",
        metaKey: true,
        target: { tagName: "INPUT", type: "search" } as unknown as EventTarget,
      }),
    ).toBe(false);
    expect(
      shouldHandleGlobalSearchShortcut({
        key: "k",
        metaKey: true,
        target: { tagName: "TEXTAREA" } as unknown as EventTarget,
      }),
    ).toBe(false);
    expect(
      shouldHandleGlobalSearchShortcut({
        key: "k",
        metaKey: true,
        target: { tagName: "DIV", isContentEditable: true } as unknown as EventTarget,
      }),
    ).toBe(false);
  });

  it("ignores unrelated or option-modified shortcuts", () => {
    expect(
      shouldHandleGlobalSearchShortcut({
        key: "p",
        metaKey: true,
        target: null,
      }),
    ).toBe(false);
    expect(
      shouldHandleGlobalSearchShortcut({
        key: "k",
        metaKey: true,
        altKey: true,
        target: null,
      }),
    ).toBe(false);
  });
});

describe("resolveCanonicalExactProviderSessionMatch", () => {
  it("prefers the non-backup row when exact session ids are duplicated by backups", () => {
    const match = resolveCanonicalExactProviderSessionMatch("session-dup", [
      {
        ...providerRows[0],
        session_id: "session-dup",
        source: "cleanup_backups",
        file_path: "/tmp/backup/session-dup.jsonl",
      },
      {
        ...providerRows[0],
        session_id: "session-dup",
        source: "projects",
        file_path: "/tmp/projects/session-dup.jsonl",
      },
    ]);

    expect(match?.file_path).toBe("/tmp/projects/session-dup.jsonl");
  });
});

describe("useAppShellBehavior", () => {
  it("resets the search scope to all providers for generic header searches", async () => {
    const setHeaderSearchDraft = vi.fn();
    const setHeaderSearchSeed = vi.fn();
    const changeLayoutView = vi.fn();
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: { search: "?view=providers&provider=codex", pathname: "/", hash: "" },
        history: { pushState: vi.fn(), replaceState: vi.fn() },
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => storage.set(key, value),
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        setTimeout,
        clearTimeout,
      },
    });
    storage.set(SEARCH_PROVIDER_STORAGE_KEY, "codex");

    let latest: ReturnType<typeof useAppShellBehavior> | undefined;
    function Harness() {
      latest = useAppShellBehavior({
        layoutView: "providers",
        providerView: "codex",
        visibleProviderTabs: [{ id: "all" }, { id: "codex" }],
        visibleProviderIdSet: new Set(["all", "codex"]),
        providerSessionRows: [],
        visibleRows: [],
        showForensics: false,
        showThreadDetail: false,
        showSessionDetail: false,
        selectedThreadId: "",
        selectedSessionPath: "",
        searchThreadContext: null,
        analyzeErrorKey: "",
        cleanupErrorKey: "",
        headerSearchDraft: "claude",
        threadSearchInputRef: { current: null },
        detailLayoutRef: { current: null },
        panelChunkWarmupStartedRef: { current: false },
        desktopRouteAppliedRef: { current: false },
        desktopRouteHydratingRef: { current: false },
        desktopRouteRef: {
          current: { view: "", provider: "", sessionId: "", filePath: "", threadId: "" },
        },
        changeLayoutView,
        setLayoutView: vi.fn(),
        setProviderView: vi.fn(),
        setSelectedSessionPath: vi.fn(),
        setSelectedThreadId: vi.fn(),
        setAcknowledgedForensicsErrorKeys: vi.fn(),
        setSearchThreadContext: vi.fn(),
        setHeaderSearchDraft,
        setHeaderSearchSeed,
        prefetchProvidersData: vi.fn(),
        prefetchRoutingData: vi.fn(),
      });
      return createElement("div");
    }

    renderToStaticMarkup(createElement(Harness));
    await latest?.handleHeaderSearchSubmit();

    expect(setHeaderSearchDraft).toHaveBeenCalledWith("");
    expect(setHeaderSearchSeed).toHaveBeenCalledWith("claude");
    expect(storage.get(SEARCH_PROVIDER_STORAGE_KEY)).toBe("all");
    expect(changeLayoutView).toHaveBeenCalledWith("search");
  });

  it("probes an exact provider session before honoring a local thread match in providers mode", async () => {
    const setSearchThreadContext = vi.fn();
    const setSelectedSessionPath = vi.fn();
    const setSelectedThreadId = vi.fn();
    const setProviderView = vi.fn();
    const changeLayoutView = vi.fn();
    const setHeaderSearchDraft = vi.fn();
    const lookupExactSessionTarget = vi.fn(async () => ({
      sessionId: "019da643-a401-71e2-8c40-a88e8e47acdf",
      filePath: "/tmp/codex/older-session.jsonl",
      providerView: "codex" as const,
    }));
    const lookupExactThreadTarget = vi.fn(async () => ({
      threadId: "019da643-a401-71e2-8c40-a88e8e47acdf",
    }));

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          search: "?view=providers&provider=claude",
          pathname: "/",
          hash: "",
        },
        history: {
          pushState: vi.fn(),
          replaceState: vi.fn(),
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        setTimeout,
        clearTimeout,
      },
    });

    let latest: ReturnType<typeof useAppShellBehavior> | undefined;
    function Harness() {
      latest = useAppShellBehavior({
        layoutView: "providers",
        providerView: "claude",
        visibleProviderTabs: [{ id: "all" }, { id: "claude" }, { id: "codex" }],
        visibleProviderIdSet: new Set(["all", "claude", "codex"]),
        providerSessionRows: [
          {
            provider: "claude",
            source: "history",
            session_id: "b8792a1a-7606-4247-abec-819b25dddf65",
            display_title: "Claude current",
            file_path: "/tmp/claude/current.jsonl",
            size_bytes: 10,
            mtime: "2026-03-27T00:00:00.000Z",
            probe: {
              ok: true,
              format: "jsonl",
              error: null,
              detected_title: "Claude current",
              title_source: "header",
            },
          },
        ],
        visibleRows: [
          {
            thread_id: "019da643-a401-71e2-8c40-a88e8e47acdf",
            title: "Overlapping thread",
            source: "codex",
            risk_score: 0,
            is_pinned: false,
          },
        ],
        showForensics: false,
        showThreadDetail: false,
        showSessionDetail: true,
        selectedThreadId: "",
        selectedSessionPath: "",
        searchThreadContext: null,
        analyzeErrorKey: "",
        cleanupErrorKey: "",
        headerSearchDraft: "019da643-a401-71e2-8c40-a88e8e47acdf",
        threadSearchInputRef: { current: null },
        detailLayoutRef: { current: null },
        panelChunkWarmupStartedRef: { current: false },
        desktopRouteAppliedRef: { current: false },
        desktopRouteHydratingRef: { current: false },
        desktopRouteRef: {
          current: { view: "", provider: "", sessionId: "", filePath: "", threadId: "" },
        },
        changeLayoutView,
        setLayoutView: vi.fn(),
        setProviderView,
        setSelectedSessionPath,
        setSelectedThreadId,
        setAcknowledgedForensicsErrorKeys: vi.fn(),
        setSearchThreadContext,
        setHeaderSearchDraft,
        setHeaderSearchSeed: vi.fn(),
        prefetchProvidersData: vi.fn(),
        prefetchRoutingData: vi.fn(),
        lookupExactThreadTarget,
        lookupExactSessionTarget,
      });
      return createElement("div");
    }

    renderToStaticMarkup(createElement(Harness));
    await latest?.handleHeaderSearchSubmit();

    expect(setHeaderSearchDraft).toHaveBeenCalledWith("");
    expect(lookupExactSessionTarget).toHaveBeenCalledWith("019da643-a401-71e2-8c40-a88e8e47acdf");
    expect(setSelectedThreadId).toHaveBeenCalledWith("");
    expect(setProviderView).toHaveBeenCalledWith("codex");
    expect(setSelectedSessionPath).toHaveBeenCalledWith("/tmp/codex/older-session.jsonl");
    expect(changeLayoutView).toHaveBeenCalledWith("providers");
    expect(lookupExactThreadTarget).not.toHaveBeenCalled();
  });
});

describe("desktop route helpers", () => {
  it("builds provider route search without dropping unrelated query params", () => {
    expect(
      buildDesktopRouteSearch("?ts=123", {
        view: "providers",
        provider: "claude",
        sessionId: "claude-session-1",
        filePath: "/private/secret-session.jsonl",
        threadId: "",
      }),
    ).toBe(
      "?ts=123&view=providers&provider=claude&sessionId=claude-session-1",
    );
  });

  it("parses only valid desktop route params", () => {
    expect(
      parseDesktopRouteSearch(
        "?view=providers&provider=codex&sessionId=codex-session-1&threadId=thread-1",
      ),
    ).toEqual({
      view: "providers",
      provider: "codex",
      sessionId: "codex-session-1",
      filePath: "",
      threadId: "thread-1",
    });

    expect(
      parseDesktopRouteSearch(
        "?view=invalid&provider=invalid&filePath=%2Ftmp%2Fcodex%2Fsession.jsonl&threadId=thread-2",
      ),
    ).toEqual({
      view: "",
      provider: "",
      sessionId: "",
      filePath: "",
      threadId: "thread-2",
    });
  });

  it("does not hydrate local file paths from the browser URL", () => {
    expect(
      parseDesktopRouteSearch(
        "?view=providers&provider=claude&sessionId=claude-session-1&filePath=%2Fprivate%2Fsecret.jsonl",
      ),
    ).toEqual({
      view: "providers",
      provider: "claude",
      sessionId: "claude-session-1",
      filePath: "",
      threadId: "",
    });
  });

  it("clears provider-only params when switching to search", () => {
    expect(
      buildDesktopRouteSearch(
        "?ts=123&view=providers&provider=claude&sessionId=claude-session-1",
        {
          view: "search",
          provider: "",
          sessionId: "",
          filePath: "",
          threadId: "",
        },
      ),
    ).toBe("?ts=123&view=search");
  });

  it("keeps thread params only on the threads surface", () => {
    expect(
      buildDesktopRouteSearch("?foo=bar", {
        view: "threads",
        provider: "",
        sessionId: "",
        filePath: "",
        threadId: "thread-42",
      }),
    ).toBe("?foo=bar&view=threads&threadId=thread-42");

    expect(
      buildDesktopRouteSearch("?foo=bar&threadId=thread-42", {
        view: "overview",
        provider: "",
        sessionId: "",
        filePath: "",
        threadId: "",
      }),
    ).toBe("?foo=bar&view=overview");
  });

  it("pushes history only when the surface changes", () => {
    expect(
      shouldPushDesktopRouteHistory(
        { view: "search", provider: "", sessionId: "", filePath: "", threadId: "" },
        { view: "providers", provider: "claude", sessionId: "", filePath: "", threadId: "" },
      ),
    ).toBe(true);
    expect(
      shouldPushDesktopRouteHistory(
        { view: "providers", provider: "claude", sessionId: "", filePath: "", threadId: "" },
        {
          view: "providers",
          provider: "claude",
          sessionId: "claude-session-a",
          filePath: "",
          threadId: "",
        },
      ),
    ).toBe(true);
  });

  it("pushes history when leaving a provider detail route back to the provider root", () => {
    expect(
      shouldPushDesktopRouteHistory(
        {
          view: "providers",
          provider: "claude",
          sessionId: "claude-session-a",
          filePath: "",
          threadId: "",
        },
        { view: "providers", provider: "claude", sessionId: "", filePath: "", threadId: "" },
      ),
    ).toBe(true);
  });

  it("pushes history when the selected provider changes inside the sessions surface", () => {
    expect(
      shouldPushDesktopRouteHistory(
        { view: "providers", provider: "copilot", sessionId: "", filePath: "", threadId: "" },
        { view: "providers", provider: "codex", sessionId: "", filePath: "", threadId: "" },
      ),
    ).toBe(true);
  });

  it("defers URL sync while a routed detail selection is still loading", () => {
    expect(
      shouldDeferDesktopRouteSync({
        currentRoute: {
          view: "providers",
          provider: "codex",
          sessionId: "codex-session-1",
          filePath: "/tmp/codex/session.jsonl",
          threadId: "",
        },
        layoutView: "overview",
        providerView: "all",
        selectedSessionId: "",
        selectedSessionPath: "",
        selectedThreadId: "",
        routeHydrating: true,
      }),
    ).toBe(true);

    expect(
      shouldDeferDesktopRouteSync({
        currentRoute: {
          view: "providers",
          provider: "all",
          sessionId: "claude-session-1",
          filePath: "/tmp/claude/session.jsonl",
          threadId: "",
        },
        layoutView: "providers",
        providerView: "all",
        selectedSessionId: "",
        selectedSessionPath: "",
        selectedThreadId: "",
        routeHydrating: true,
      }),
    ).toBe(true);

    expect(
      shouldDeferDesktopRouteSync({
        currentRoute: {
          view: "providers",
          provider: "all",
          sessionId: "codex-session-1",
          filePath: "/tmp/codex/session.jsonl",
          threadId: "",
        },
        layoutView: "providers",
        providerView: "all",
        selectedSessionId: "",
        selectedSessionPath: "",
        selectedThreadId: "",
        routeHydrating: true,
      }),
    ).toBe(true);

    expect(
      shouldDeferDesktopRouteSync({
        currentRoute: {
          view: "providers",
          provider: "codex",
          sessionId: "codex-session-1",
          filePath: "/tmp/codex/session.jsonl",
          threadId: "",
        },
        layoutView: "providers",
        providerView: "all",
        selectedSessionId: "codex-session-1",
        selectedSessionPath: "/tmp/codex/session.jsonl",
        selectedThreadId: "",
        routeHydrating: true,
      }),
    ).toBe(true);

    expect(
      shouldDeferDesktopRouteSync({
        currentRoute: {
          view: "threads",
          provider: "",
          sessionId: "",
          filePath: "",
          threadId: "thread-123",
        },
        layoutView: "threads",
        providerView: "all",
        selectedSessionId: "",
        selectedSessionPath: "",
        selectedThreadId: "",
        routeHydrating: true,
      }),
    ).toBe(true);

    expect(
      shouldDeferDesktopRouteSync({
        currentRoute: {
          view: "providers",
          provider: "all",
          sessionId: "codex-session-1",
          filePath: "/tmp/codex/session.jsonl",
          threadId: "",
        },
        layoutView: "providers",
        providerView: "all",
        selectedSessionId: "codex-session-1",
        selectedSessionPath: "/tmp/codex/session.jsonl",
        selectedThreadId: "",
        routeHydrating: true,
      }),
    ).toBe(false);

    expect(
      shouldDeferDesktopRouteSync({
        currentRoute: {
          view: "providers",
          provider: "codex",
          sessionId: "codex-session-1",
          filePath: "/tmp/codex/session.jsonl",
          threadId: "",
        },
        layoutView: "threads",
        providerView: "codex",
        selectedSessionId: "codex-session-1",
        selectedSessionPath: "/tmp/codex/session.jsonl",
        selectedThreadId: "",
        routeHydrating: false,
      }),
    ).toBe(false);

    expect(
      shouldDeferDesktopRouteSync({
        currentRoute: {
          view: "threads",
          provider: "",
          sessionId: "",
          filePath: "",
          threadId: "thread-123",
        },
        layoutView: "search",
        providerView: "all",
        selectedSessionId: "",
        selectedSessionPath: "",
        selectedThreadId: "thread-123",
        routeHydrating: false,
      }),
    ).toBe(false);

    expect(
      shouldDeferDesktopRouteSync({
        currentRoute: {
          view: "providers",
          provider: "codex",
          sessionId: "",
          filePath: "",
          threadId: "",
        },
        layoutView: "providers",
        providerView: "all",
        selectedSessionId: "",
        selectedSessionPath: "",
        selectedThreadId: "",
        routeHydrating: false,
        visibleProviderTabs: [{ id: "all" }, { id: "claude" }],
      }),
    ).toBe(false);

    expect(
      shouldDeferDesktopRouteSync({
        currentRoute: {
          view: "providers",
          provider: "codex",
          sessionId: "",
          filePath: "",
          threadId: "",
        },
        layoutView: "providers",
        providerView: "all",
        selectedSessionId: "",
        selectedSessionPath: "",
        selectedThreadId: "",
        routeHydrating: false,
        visibleProviderTabs: [{ id: "all" }],
      }),
    ).toBe(false);

    expect(
      shouldDeferDesktopRouteSync({
        currentRoute: {
          view: "providers",
          provider: "copilot",
          sessionId: "",
          filePath: "",
          threadId: "",
        },
        layoutView: "providers",
        providerView: "all",
        selectedSessionId: "",
        selectedSessionPath: "",
        selectedThreadId: "",
        routeHydrating: false,
        visibleProviderTabs: [{ id: "all" }, { id: "copilot" }],
      }),
    ).toBe(false);

    expect(
      shouldDeferDesktopRouteSync({
        currentRoute: {
          view: "providers",
          provider: "copilot",
          sessionId: "",
          filePath: "",
          threadId: "",
        },
        layoutView: "providers",
        providerView: "all",
        selectedSessionId: "",
        selectedSessionPath: "",
        selectedThreadId: "",
        routeHydrating: true,
        visibleProviderTabs: [{ id: "all" }, { id: "copilot" }],
      }),
    ).toBe(true);

    expect(
      shouldDeferDesktopRouteSync({
        currentRoute: {
          view: "providers",
          provider: "codex",
          sessionId: "",
          filePath: "",
          threadId: "",
        },
        layoutView: "providers",
        providerView: "all",
        selectedSessionId: "",
        selectedSessionPath: "",
        selectedThreadId: "",
        routeHydrating: true,
        visibleProviderTabs: [{ id: "all" }],
      }),
    ).toBe(true);

    expect(
      shouldDeferDesktopRouteSync({
        currentRoute: {
          view: "providers",
          provider: "copilot",
          sessionId: "copilot-session-1",
          filePath: "/tmp/copilot/session.json",
          threadId: "",
        },
        layoutView: "providers",
        providerView: "all",
        selectedSessionId: "",
        selectedSessionPath: "",
        selectedThreadId: "",
        routeHydrating: false,
        visibleProviderTabs: [{ id: "all" }, { id: "copilot" }, { id: "codex" }],
      }),
    ).toBe(false);

    expect(
      shouldDeferDesktopRouteSync({
        currentRoute: {
          view: "providers",
          provider: "claude",
          sessionId: "claude-session-1",
          filePath: "/tmp/claude/session.jsonl",
          threadId: "",
        },
        layoutView: "providers",
        providerView: "claude",
        selectedSessionId: "",
        selectedSessionPath: "",
        selectedThreadId: "",
        routeHydrating: false,
        visibleProviderTabs: [{ id: "all" }, { id: "claude" }],
      }),
    ).toBe(false);

    expect(
      shouldDeferDesktopRouteSync({
        currentRoute: {
          view: "threads",
          provider: "",
          sessionId: "",
          filePath: "",
          threadId: "thread-123",
        },
        layoutView: "threads",
        providerView: "all",
        selectedSessionId: "",
        selectedSessionPath: "",
        selectedThreadId: "",
        routeHydrating: false,
      }),
    ).toBe(false);
  });

  it("defers provider fallback while a provider detail deep-link is still hydrating", () => {
    expect(
      shouldDeferProviderFallback({
        currentRoute: {
          view: "providers",
          provider: "codex",
          sessionId: "codex-session-1",
          filePath: "/tmp/codex/session.jsonl",
          threadId: "",
        },
        visibleProviderTabs: [{ id: "all" }],
        routeHydrating: true,
      }),
    ).toBe(true);
  });

  it("only restores routed provider detail while route hydration is active", () => {
    expect(
      shouldRestoreRoutedSessionSelection({
        routeHydrating: true,
        layoutView: "providers",
        routeSessionId: "codex-session-1",
        routeFilePath: "/tmp/codex/session.jsonl",
        selectedSessionPath: "",
        providerSessionRows: [
          { session_id: "codex-session-1", file_path: "/tmp/codex/session.jsonl" } as never,
        ],
      }),
    ).toBe(true);

    expect(
      shouldRestoreRoutedSessionSelection({
        routeHydrating: false,
        layoutView: "providers",
        routeSessionId: "codex-session-1",
        routeFilePath: "/tmp/codex/session.jsonl",
        selectedSessionPath: "",
        providerSessionRows: [
          { session_id: "codex-session-1", file_path: "/tmp/codex/session.jsonl" } as never,
        ],
      }),
    ).toBe(false);
  });

  it("only restores routed thread detail while route hydration is active", () => {
    expect(
      shouldRestoreRoutedThreadSelection({
        routeHydrating: true,
        layoutView: "threads",
        routeThreadId: "thread-123",
        selectedThreadId: "",
        visibleRows: [{ thread_id: "thread-123" } as never],
      }),
    ).toBe(true);

    expect(
      shouldRestoreRoutedThreadSelection({
        routeHydrating: false,
        layoutView: "threads",
        routeThreadId: "thread-123",
        selectedThreadId: "",
        visibleRows: [{ thread_id: "thread-123" } as never],
      }),
    ).toBe(false);
  });

  it("defers provider fallback while a provider-only deep-link is still hydrating", () => {
    expect(
      shouldDeferProviderFallback({
        currentRoute: {
          view: "providers",
          provider: "copilot",
          sessionId: "",
          filePath: "",
          threadId: "",
        },
        visibleProviderTabs: [{ id: "all" }],
        routeHydrating: true,
      }),
    ).toBe(true);
  });

  it("does not defer provider fallback when the route is not a provider detail deep-link", () => {
    expect(
      shouldDeferProviderFallback({
        currentRoute: {
          view: "threads",
          provider: "",
          sessionId: "",
          filePath: "",
          threadId: "thread-1",
        },
        visibleProviderTabs: [{ id: "all" }],
      }),
    ).toBe(false);

    expect(
      shouldDeferProviderFallback({
        currentRoute: {
          view: "providers",
          provider: "all",
          sessionId: "codex-session-1",
          filePath: "/tmp/codex/session.jsonl",
          threadId: "",
        },
        visibleProviderTabs: [{ id: "all" }],
      }),
    ).toBe(false);

    expect(
      shouldDeferProviderFallback({
        currentRoute: {
          view: "providers",
          provider: "codex",
          sessionId: "",
          filePath: "",
          threadId: "",
        },
        visibleProviderTabs: [{ id: "all" }],
        routeHydrating: false,
      }),
    ).toBe(false);
  });

  it("only applies provider fallback inside the sessions surface", () => {
    expect(
      shouldApplyProviderFallback({
        layoutView: "overview",
        providerView: "gemini",
        visibleProviderTabs: [{ id: "all" }, { id: "codex" }],
        visibleProviderIdSet: new Set(["all", "codex"]),
        currentRoute: { view: "overview", provider: "", sessionId: "", filePath: "", threadId: "" },
        routeHydrating: false,
      }),
    ).toBe(false);

    expect(
      shouldApplyProviderFallback({
        layoutView: "providers",
        providerView: "gemini",
        visibleProviderTabs: [{ id: "all" }, { id: "codex" }],
        visibleProviderIdSet: new Set(["all", "codex"]),
        currentRoute: { view: "providers", provider: "", sessionId: "", filePath: "", threadId: "" },
        routeHydrating: false,
      }),
    ).toBe(true);
  });

  it("does not apply provider fallback while a provider-only deep-link is hydrating", () => {
    expect(
      shouldApplyProviderFallback({
        layoutView: "providers",
        providerView: "copilot",
        visibleProviderTabs: [{ id: "all" }],
        visibleProviderIdSet: new Set(["all"]),
        currentRoute: {
          view: "providers",
          provider: "copilot",
          sessionId: "",
          filePath: "",
          threadId: "",
        },
        routeHydrating: true,
      }),
    ).toBe(false);
  });

  it("does not apply provider fallback before provider tabs finish resolving the routed provider", () => {
    expect(
      shouldApplyProviderFallback({
        layoutView: "providers",
        providerView: "copilot",
        visibleProviderTabs: [{ id: "all" }],
        visibleProviderIdSet: new Set(["all"]),
        currentRoute: {
          view: "providers",
          provider: "copilot",
          sessionId: "",
          filePath: "",
          threadId: "",
        },
        routeHydrating: false,
      }),
    ).toBe(false);
  });

  it("resolves provider fallback only when the current provider disappears", () => {
    expect(
      getFallbackProviderView("all", [{ id: "all" }, { id: "codex" }], new Set(["all", "codex"])),
    ).toBeNull();

    expect(
      getFallbackProviderView(
        "codex",
        [{ id: "all" }, { id: "codex" }],
        new Set(["all", "codex"]),
      ),
    ).toBeNull();

    expect(
      getFallbackProviderView(
        "gemini",
        [{ id: "all" }, { id: "codex" }, { id: "claude" }],
        new Set(["all", "codex", "claude"]),
      ),
    ).toBe("codex");

    expect(getFallbackProviderView("gemini", [{ id: "all" }], new Set(["all"]))).toBe("all");
  });

  it("autoscrolls detail only for visible changed selections", () => {
    expect(
      shouldAutoScrollDetailIntoView({
        detailVisible: true,
        previousSelection: "",
        nextSelection: "thread-1",
      }),
    ).toBe(true);

    expect(
      shouldAutoScrollDetailIntoView({
        detailVisible: false,
        previousSelection: "",
        nextSelection: "thread-1",
      }),
    ).toBe(false);

    expect(
      shouldAutoScrollDetailIntoView({
        detailVisible: true,
        previousSelection: "thread-1",
        nextSelection: "thread-1",
      }),
    ).toBe(false);

    expect(
      shouldAutoScrollDetailIntoView({
        detailVisible: true,
        previousSelection: "",
        nextSelection: "",
      }),
    ).toBe(false);
  });

  it("uses the stored preferred provider when it is visible", () => {
    expect(
      resolvePreferredProvidersEntry({
        preferredProviderId: " claude ",
        storedProviderView: "codex",
        visibleProviderIdSet: new Set(["all", "codex", "claude"]),
      }),
    ).toBe("claude");

    expect(
      resolvePreferredProvidersEntry({
        preferredProviderId: "gemini",
        storedProviderView: "codex",
        visibleProviderIdSet: new Set(["all", "codex", "claude"]),
      }),
    ).toBe("codex");

    expect(
      resolvePreferredProvidersEntry({
        preferredProviderId: "codex",
        storedProviderView: "all",
        visibleProviderIdSet: new Set(["all", "codex", "claude"]),
      }),
    ).toBe("codex");

    expect(
      resolvePreferredProvidersEntry({
        preferredProviderId: "chatgpt",
        storedProviderView: "chatgpt",
        visibleProviderIdSet: new Set(["all", "codex", "claude"]),
      }),
    ).toBe("all");
  });
});
