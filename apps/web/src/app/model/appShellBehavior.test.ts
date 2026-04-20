import { describe, expect, it } from "vitest";
import {
  buildDesktopRouteSearch,
  getFallbackProviderView,
  parseDesktopRouteSearch,
  shouldAutoScrollDetailIntoView,
  shouldApplyProviderFallback,
  resolvePreferredProvidersEntry,
  resolveHeaderSearchTarget,
  shouldDeferProviderFallback,
  shouldDeferDesktopRouteSync,
  shouldPushDesktopRouteHistory,
} from "@/app/model/appShellBehavior";
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

describe("desktop route helpers", () => {
  it("builds provider route search without dropping unrelated query params", () => {
    expect(
      buildDesktopRouteSearch("?ts=123", {
        view: "providers",
        provider: "claude",
        filePath: "/tmp/claude/session.jsonl",
        threadId: "",
      }),
    ).toBe(
      "?ts=123&view=providers&provider=claude&filePath=%2Ftmp%2Fclaude%2Fsession.jsonl",
    );
  });

  it("parses only valid desktop route params", () => {
    expect(
      parseDesktopRouteSearch(
        "?view=providers&provider=codex&filePath=%2Ftmp%2Fcodex%2Fsession.jsonl&threadId=thread-1",
      ),
    ).toEqual({
      view: "providers",
      provider: "codex",
      filePath: "/tmp/codex/session.jsonl",
      threadId: "thread-1",
    });

    expect(
      parseDesktopRouteSearch(
        "?view=invalid&provider=invalid&filePath=%2Ftmp%2Fcodex%2Fsession.jsonl&threadId=thread-2",
      ),
    ).toEqual({
      view: "",
      provider: "",
      filePath: "/tmp/codex/session.jsonl",
      threadId: "thread-2",
    });
  });

  it("clears provider-only params when switching to search", () => {
    expect(
      buildDesktopRouteSearch(
        "?ts=123&view=providers&provider=claude&filePath=%2Ftmp%2Fclaude%2Fsession.jsonl",
        {
          view: "search",
          provider: "",
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
        filePath: "",
        threadId: "thread-42",
      }),
    ).toBe("?foo=bar&view=threads&threadId=thread-42");

    expect(
      buildDesktopRouteSearch("?foo=bar&threadId=thread-42", {
        view: "overview",
        provider: "",
        filePath: "",
        threadId: "",
      }),
    ).toBe("?foo=bar&view=overview");
  });

  it("pushes history only when the surface changes", () => {
    expect(
      shouldPushDesktopRouteHistory(
        { view: "search", provider: "", filePath: "", threadId: "" },
        { view: "providers", provider: "claude", filePath: "", threadId: "" },
      ),
    ).toBe(true);
    expect(
      shouldPushDesktopRouteHistory(
        { view: "providers", provider: "claude", filePath: "", threadId: "" },
        { view: "providers", provider: "claude", filePath: "/tmp/a.jsonl", threadId: "" },
      ),
    ).toBe(false);
  });

  it("defers URL sync while a routed detail selection is still loading", () => {
    expect(
      shouldDeferDesktopRouteSync({
        currentRoute: {
          view: "providers",
          provider: "codex",
          filePath: "/tmp/codex/session.jsonl",
          threadId: "",
        },
        layoutView: "overview",
        providerView: "all",
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
          filePath: "/tmp/claude/session.jsonl",
          threadId: "",
        },
        layoutView: "providers",
        providerView: "all",
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
          filePath: "/tmp/codex/session.jsonl",
          threadId: "",
        },
        layoutView: "providers",
        providerView: "all",
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
          filePath: "/tmp/codex/session.jsonl",
          threadId: "",
        },
        layoutView: "providers",
        providerView: "all",
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
          filePath: "",
          threadId: "thread-123",
        },
        layoutView: "threads",
        providerView: "all",
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
          filePath: "/tmp/codex/session.jsonl",
          threadId: "",
        },
        layoutView: "providers",
        providerView: "all",
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
          filePath: "/tmp/codex/session.jsonl",
          threadId: "",
        },
        layoutView: "threads",
        providerView: "codex",
        selectedSessionPath: "/tmp/codex/session.jsonl",
        selectedThreadId: "",
        routeHydrating: false,
      }),
    ).toBe(false);

    expect(
      shouldDeferDesktopRouteSync({
        currentRoute: {
          view: "providers",
          provider: "codex",
          filePath: "",
          threadId: "",
        },
        layoutView: "providers",
        providerView: "all",
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
          filePath: "",
          threadId: "",
        },
        layoutView: "providers",
        providerView: "all",
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
          filePath: "",
          threadId: "",
        },
        layoutView: "providers",
        providerView: "all",
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
          filePath: "",
          threadId: "",
        },
        layoutView: "providers",
        providerView: "all",
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
          filePath: "",
          threadId: "",
        },
        layoutView: "providers",
        providerView: "all",
        selectedSessionPath: "",
        selectedThreadId: "",
        routeHydrating: true,
        visibleProviderTabs: [{ id: "all" }],
      }),
    ).toBe(true);
  });

  it("defers provider fallback while a provider detail deep-link is still hydrating", () => {
    expect(
      shouldDeferProviderFallback({
        currentRoute: {
          view: "providers",
          provider: "codex",
          filePath: "/tmp/codex/session.jsonl",
          threadId: "",
        },
        visibleProviderTabs: [{ id: "all" }],
      }),
    ).toBe(true);
  });

  it("does not defer provider fallback when the route is not a provider detail deep-link", () => {
    expect(
      shouldDeferProviderFallback({
        currentRoute: {
          view: "threads",
          provider: "",
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
          filePath: "",
          threadId: "",
        },
        visibleProviderTabs: [{ id: "all" }],
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
        currentRoute: { view: "overview", provider: "", filePath: "", threadId: "" },
      }),
    ).toBe(false);

    expect(
      shouldApplyProviderFallback({
        layoutView: "providers",
        providerView: "gemini",
        visibleProviderTabs: [{ id: "all" }, { id: "codex" }],
        visibleProviderIdSet: new Set(["all", "codex"]),
        currentRoute: { view: "providers", provider: "", filePath: "", threadId: "" },
      }),
    ).toBe(true);
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
