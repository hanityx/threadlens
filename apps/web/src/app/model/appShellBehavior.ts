import { startTransition, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { PROVIDER_IDS } from "@threadlens/shared-contracts";
import type { ConversationSearchHit, LayoutView, ProviderSessionRow, ProviderView, ThreadRow } from "@/shared/types";
import { normalizeDesktopRouteFilePath } from "@/app/model/desktopRoute";

const VALID_LAYOUT_VIEWS = new Set<LayoutView>(["overview", "search", "providers", "threads"]);
const VALID_PROVIDER_VIEWS = new Set<ProviderView>(["all", ...PROVIDER_IDS]);

const preloadProvidersPanel = () => {
  void import("@/features/providers/components/ProvidersPanel");
};

const preloadThreadDetail = () => {
  void import("@/features/threads/components/ThreadDetail");
};

const preloadSessionDetail = () => {
  void import("@/features/providers/session/SessionDetail");
};

const preloadRoutingPanel = () => {
  void import("@/features/providers/routing/RoutingPanel");
};

const preloadForensicsPanel = () => {
  void import("@/features/threads/components/ForensicsPanel");
};

export type DesktopRouteState = {
  view: LayoutView | "";
  provider: ProviderView | "";
  filePath: string;
  threadId: string;
};

type AcknowledgedForensicsErrorKeys = {
  analyze: string;
  cleanup: string;
};

type ProviderTab = {
  id: ProviderView;
};

type HeaderSearchTarget =
  | {
      kind: "session";
      filePath: string;
      providerView: ProviderView;
    }
  | {
      kind: "thread";
      threadId: string;
    };

function normalizeHeaderSearchToken(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function findUniquePrefixMatch<T>(
  query: string,
  items: T[],
  keysForItem: (item: T) => Array<string | null | undefined>,
): T | null {
  const exactMatches = items.filter((item) =>
    keysForItem(item).some((key) => normalizeHeaderSearchToken(String(key || "")) === query),
  );
  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1) return null;

  const prefixMatches = items.filter((item) =>
    keysForItem(item).some((key) => normalizeHeaderSearchToken(String(key || "")).startsWith(query)),
  );
  return prefixMatches.length === 1 ? prefixMatches[0] : null;
}

export function resolveHeaderSearchTarget(options: {
  query: string;
  visibleProviderIdSet: Set<string>;
  providerSessionRows: ProviderSessionRow[];
  threadRows: ThreadRow[];
}): HeaderSearchTarget | null {
  const normalizedQuery = normalizeHeaderSearchToken(options.query);
  if (!normalizedQuery) return null;

  const providerMatch = findUniquePrefixMatch(
    normalizedQuery,
    options.providerSessionRows,
    (row) => [row.session_id, row.file_path],
  );
  if (providerMatch) {
    return {
      kind: "session",
      filePath: providerMatch.file_path,
      providerView: options.visibleProviderIdSet.has(providerMatch.provider)
        ? (providerMatch.provider as ProviderView)
        : "all",
    };
  }

  const threadMatch = findUniquePrefixMatch(
    normalizedQuery,
    options.threadRows,
    (row) => [row.thread_id],
  );
  if (threadMatch) {
    return {
      kind: "thread",
      threadId: threadMatch.thread_id,
    };
  }

  return null;
}

export function parseDesktopRouteSearch(search: string): DesktopRouteState {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const view = params.get("view");
  const provider = params.get("provider");
  return {
    view: VALID_LAYOUT_VIEWS.has(view as LayoutView) ? (view as LayoutView) : "",
    provider: VALID_PROVIDER_VIEWS.has(String(provider || "")) ? (provider as ProviderView) : "",
    filePath: normalizeDesktopRouteFilePath(params.get("filePath") ?? ""),
    threadId: params.get("threadId") ?? "",
  };
}

export function buildDesktopRouteSearch(
  currentSearch: string,
  route: DesktopRouteState,
): string {
  const params = new URLSearchParams(String(currentSearch || "").replace(/^\?/, ""));
  params.set("view", route.view || "overview");

  if (route.view === "providers" && route.provider) {
    params.set("provider", route.provider);
  } else {
    params.delete("provider");
  }

  if (route.view === "providers" && route.filePath) {
    params.set("filePath", route.filePath);
  } else {
    params.delete("filePath");
  }

  if (route.view === "threads" && route.threadId) {
    params.set("threadId", route.threadId);
  } else {
    params.delete("threadId");
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export function shouldPushDesktopRouteHistory(
  previousRoute: DesktopRouteState | null,
  nextRoute: DesktopRouteState,
): boolean {
  if (!previousRoute) return false;
  return previousRoute.view !== nextRoute.view;
}

export function shouldDeferDesktopRouteSync(options: {
  currentRoute: DesktopRouteState;
  layoutView: LayoutView;
  providerView: ProviderView;
  selectedSessionPath: string;
  selectedThreadId: string;
  routeHydrating?: boolean;
  visibleProviderTabs?: ProviderTab[];
}): boolean {
  if (options.routeHydrating) {
    if (options.currentRoute.view === "providers") {
      const providerReady =
        options.layoutView === "providers" &&
        (!options.currentRoute.provider ||
          options.currentRoute.provider === "all" ||
          options.providerView === options.currentRoute.provider);
      const detailReady =
        !options.currentRoute.filePath ||
        options.selectedSessionPath === options.currentRoute.filePath;
      if (!providerReady || !detailReady) {
        return true;
      }
    }

    if (options.currentRoute.view === "threads") {
      const threadReady =
        options.layoutView === "threads" &&
        (!options.currentRoute.threadId ||
          options.selectedThreadId === options.currentRoute.threadId);
      if (!threadReady) {
        return true;
      }
    }
  }

  if (
    options.routeHydrating &&
    options.currentRoute.view === "providers" &&
    options.layoutView === "providers" &&
    options.currentRoute.provider &&
    options.currentRoute.provider !== "all" &&
    !options.selectedSessionPath &&
    options.providerView === "all"
  ) {
    const nonAllVisibleTabs = (options.visibleProviderTabs ?? []).filter((tab) => tab.id !== "all");
    if (nonAllVisibleTabs.length === 0) return true;
    if (nonAllVisibleTabs.some((tab) => tab.id === options.currentRoute.provider)) {
      return true;
    }
  }

  return Boolean(
    (options.currentRoute.view === "providers" &&
      options.layoutView === "providers" &&
      options.currentRoute.filePath &&
      (!options.selectedSessionPath ||
        (options.currentRoute.provider &&
          options.currentRoute.provider !== "all" &&
          options.selectedSessionPath === options.currentRoute.filePath &&
          options.providerView !== options.currentRoute.provider))) ||
      (options.currentRoute.view === "threads" &&
        options.layoutView === "threads" &&
        options.currentRoute.threadId &&
        !options.selectedThreadId),
  );
}

export function shouldDeferProviderFallback(options: {
  currentRoute: DesktopRouteState;
  visibleProviderTabs: ProviderTab[];
}): boolean {
  if (options.currentRoute.view !== "providers") return false;
  if (!options.currentRoute.provider || options.currentRoute.provider === "all") return false;
  if (!options.currentRoute.filePath) return false;
  const nonAllVisibleTabs = options.visibleProviderTabs.filter((tab) => tab.id !== "all");
  return nonAllVisibleTabs.length === 0;
}

export function shouldApplyProviderFallback(options: {
  layoutView: LayoutView;
  providerView: ProviderView;
  visibleProviderTabs: ProviderTab[];
  visibleProviderIdSet: Set<string>;
  currentRoute: DesktopRouteState;
}): boolean {
  if (options.layoutView !== "providers") return false;
  if (
    shouldDeferProviderFallback({
      currentRoute: options.currentRoute,
      visibleProviderTabs: options.visibleProviderTabs,
    })
  ) {
    return false;
  }
  return Boolean(
    getFallbackProviderView(
      options.providerView,
      options.visibleProviderTabs,
      options.visibleProviderIdSet,
    ),
  );
}

function applyDesktopRoute(options: {
  setLayoutView: Dispatch<SetStateAction<LayoutView>>;
  setProviderView: Dispatch<SetStateAction<ProviderView>>;
  setSelectedSessionPath: Dispatch<SetStateAction<string>>;
  setSelectedThreadId: Dispatch<SetStateAction<string>>;
}, nextRoute: DesktopRouteState) {
  const routedView = nextRoute.view;
  if (routedView) {
    startTransition(() => {
      options.setLayoutView(routedView);
    });
  }

  if (nextRoute.view === "providers") {
    startTransition(() => {
      options.setProviderView(nextRoute.provider || "all");
    });
  }

  options.setSelectedSessionPath(nextRoute.view === "providers" ? nextRoute.filePath : "");
  options.setSelectedThreadId(nextRoute.view === "threads" ? nextRoute.threadId : "");
}

export function getFallbackProviderView(
  providerView: ProviderView,
  visibleProviderTabs: ProviderTab[],
  visibleProviderIdSet: Set<string>,
): ProviderView | null {
  if (providerView === "all") return null;
  if (visibleProviderIdSet.has(providerView)) return null;
  return (
    (visibleProviderTabs.find((tab) => tab.id !== "all")?.id as ProviderView | undefined) ?? "all"
  );
}

export function resolvePreferredProvidersEntry(options: {
  preferredProviderId?: string | null | undefined;
  storedProviderView: string | null | undefined;
  visibleProviderIdSet: Set<string>;
}): ProviderView {
  const preferred = String(options.preferredProviderId || "").trim();
  if (
    preferred &&
    preferred !== "all" &&
    VALID_PROVIDER_VIEWS.has(preferred) &&
    options.visibleProviderIdSet.has(preferred)
  ) {
    return preferred as ProviderView;
  }
  const stored = String(options.storedProviderView || "").trim();
  if (stored && stored !== "all" && VALID_PROVIDER_VIEWS.has(stored) && options.visibleProviderIdSet.has(stored)) {
    return stored as ProviderView;
  }
  return "all";
}

export function shouldAutoScrollDetailIntoView(options: {
  detailVisible: boolean;
  previousSelection: string;
  nextSelection: string;
}): boolean {
  return Boolean(
    options.detailVisible &&
      options.nextSelection &&
      options.nextSelection !== options.previousSelection,
  );
}

export function useAppShellBehavior(options: {
  layoutView: LayoutView;
  providerView: ProviderView;
  visibleProviderTabs: ProviderTab[];
  visibleProviderIdSet: Set<string>;
  providerSessionRows: ProviderSessionRow[];
  visibleRows: ThreadRow[];
  showForensics: boolean;
  showThreadDetail: boolean;
  showSessionDetail: boolean;
  selectedThreadId: string;
  selectedSessionPath: string;
  searchThreadContext: ConversationSearchHit | null;
  analyzeErrorKey: string;
  cleanupErrorKey: string;
  headerSearchDraft: string;
  threadSearchInputRef: MutableRefObject<HTMLInputElement | null>;
  detailLayoutRef: MutableRefObject<HTMLElement | null>;
  panelChunkWarmupStartedRef: MutableRefObject<boolean>;
  desktopRouteAppliedRef: MutableRefObject<boolean>;
  desktopRouteHydratingRef: MutableRefObject<boolean>;
  desktopRouteRef: MutableRefObject<DesktopRouteState>;
  changeLayoutView: (nextView: LayoutView) => void;
  setLayoutView: Dispatch<SetStateAction<LayoutView>>;
  setProviderView: Dispatch<SetStateAction<ProviderView>>;
  setSelectedSessionPath: Dispatch<SetStateAction<string>>;
  setSelectedThreadId: Dispatch<SetStateAction<string>>;
  setAcknowledgedForensicsErrorKeys: Dispatch<SetStateAction<AcknowledgedForensicsErrorKeys>>;
  setSearchThreadContext: Dispatch<SetStateAction<ConversationSearchHit | null>>;
  setHeaderSearchDraft: Dispatch<SetStateAction<string>>;
  setHeaderSearchSeed: Dispatch<SetStateAction<string>>;
  prefetchProvidersData: () => void;
  prefetchRoutingData: () => void;
}) {
  useEffect(() => {
    if (options.desktopRouteAppliedRef.current) return;
    if (typeof window === "undefined") return;

    options.desktopRouteAppliedRef.current = true;
    const nextRoute = parseDesktopRouteSearch(window.location.search);
    options.desktopRouteRef.current = nextRoute;
    options.desktopRouteHydratingRef.current = Boolean(
      nextRoute.view || nextRoute.provider || nextRoute.filePath || nextRoute.threadId,
    );

    if (!nextRoute.view && !nextRoute.provider && !nextRoute.filePath && !nextRoute.threadId) {
      return;
    }
    applyDesktopRoute(options, nextRoute);
  }, [
    options.desktopRouteAppliedRef,
    options.desktopRouteRef,
    options.setLayoutView,
    options.setProviderView,
    options.setSelectedSessionPath,
    options.setSelectedThreadId,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onPopState = () => {
      const nextRoute = parseDesktopRouteSearch(window.location.search);
      options.desktopRouteRef.current = nextRoute;
      options.desktopRouteHydratingRef.current = Boolean(
        nextRoute.view || nextRoute.provider || nextRoute.filePath || nextRoute.threadId,
      );
      applyDesktopRoute(options, nextRoute);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [
    options.desktopRouteRef,
    options.setLayoutView,
    options.setProviderView,
    options.setSelectedSessionPath,
    options.setSelectedThreadId,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!options.desktopRouteAppliedRef.current) return;

    const currentRoute = parseDesktopRouteSearch(window.location.search);
    if (
      shouldDeferDesktopRouteSync({
        currentRoute,
        layoutView: options.layoutView,
        providerView: options.providerView,
        selectedSessionPath: options.selectedSessionPath,
        selectedThreadId: options.selectedThreadId,
        routeHydrating: options.desktopRouteHydratingRef.current,
        visibleProviderTabs: options.visibleProviderTabs,
      })
    ) {
      options.desktopRouteRef.current = currentRoute;
      return;
    }

    options.desktopRouteHydratingRef.current = false;

    const nextRoute: DesktopRouteState = {
      view: options.layoutView,
      provider: options.layoutView === "providers" ? options.providerView : "",
      filePath: options.layoutView === "providers" ? options.selectedSessionPath : "",
      threadId: options.layoutView === "threads" ? options.selectedThreadId : "",
    };
    const nextSearch = buildDesktopRouteSearch(window.location.search, nextRoute);
    const currentSearch = window.location.search || "";
    if (nextSearch === currentSearch) {
      options.desktopRouteRef.current = nextRoute;
      return;
    }

    const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    if (shouldPushDesktopRouteHistory(options.desktopRouteRef.current, nextRoute)) {
      window.history.pushState(null, "", nextUrl);
    } else {
      window.history.replaceState(null, "", nextUrl);
    }
    options.desktopRouteRef.current = nextRoute;
  }, [
    options.desktopRouteAppliedRef,
    options.desktopRouteHydratingRef,
    options.desktopRouteRef,
    options.layoutView,
    options.providerView,
    options.selectedSessionPath,
    options.selectedThreadId,
  ]);

  useEffect(() => {
    const routeFilePath = options.desktopRouteRef.current.filePath;
    if (options.layoutView !== "providers") return;
    if (!routeFilePath || options.selectedSessionPath) return;
    const routeMatch = options.providerSessionRows.some((row) => row.file_path === routeFilePath);
    if (!routeMatch) return;
    options.setSelectedSessionPath(routeFilePath);
  }, [
    options.desktopRouteRef,
    options.layoutView,
    options.providerSessionRows,
    options.selectedSessionPath,
    options.setSelectedSessionPath,
  ]);

  useEffect(() => {
    const routeThreadId = options.desktopRouteRef.current.threadId;
    if (options.layoutView !== "threads") return;
    if (!routeThreadId || options.selectedThreadId) return;
    const routeMatch = options.visibleRows.some((row) => row.thread_id === routeThreadId);
    if (!routeMatch) return;
    options.setSelectedThreadId(routeThreadId);
  }, [
    options.desktopRouteRef,
    options.layoutView,
    options.selectedThreadId,
    options.setSelectedThreadId,
    options.visibleRows,
  ]);

  useEffect(() => {
    const routedProvider = options.desktopRouteRef.current.provider;
    if (!routedProvider || routedProvider === "all") return;
    const nonAllVisibleTabs = options.visibleProviderTabs.filter((tab) => tab.id !== "all");
    if (nonAllVisibleTabs.length === 0) return;
    const routeVisible = nonAllVisibleTabs.some((tab) => tab.id === routedProvider);
    if (!routeVisible || options.providerView === routedProvider) return;

    startTransition(() => {
      options.setProviderView(routedProvider);
    });
  }, [options.providerView, options.setProviderView, options.visibleProviderTabs, options.desktopRouteRef]);

  useEffect(() => {
    if (
      !shouldApplyProviderFallback({
        layoutView: options.layoutView,
        providerView: options.providerView,
        visibleProviderTabs: options.visibleProviderTabs,
        visibleProviderIdSet: options.visibleProviderIdSet,
        currentRoute: options.desktopRouteRef.current,
      })
    ) {
      return;
    }
    const fallbackProvider = getFallbackProviderView(
      options.providerView,
      options.visibleProviderTabs,
      options.visibleProviderIdSet,
    );
    if (!fallbackProvider) return;
    startTransition(() => {
      options.setProviderView(fallbackProvider);
    });
  }, [
    options.providerView,
    options.setProviderView,
    options.visibleProviderIdSet,
    options.visibleProviderTabs,
  ]);

  useEffect(() => {
    if (!options.showForensics) return;
    options.setAcknowledgedForensicsErrorKeys((prev) => {
      const nextAnalyze = options.analyzeErrorKey || prev.analyze;
      const nextCleanup = options.cleanupErrorKey || prev.cleanup;
      if (nextAnalyze === prev.analyze && nextCleanup === prev.cleanup) {
        return prev;
      }
      return {
        analyze: nextAnalyze,
        cleanup: nextCleanup,
      };
    });
  }, [
    options.analyzeErrorKey,
    options.cleanupErrorKey,
    options.setAcknowledgedForensicsErrorKeys,
    options.showForensics,
  ]);

  useEffect(() => {
    if (options.analyzeErrorKey) return;
    options.setAcknowledgedForensicsErrorKeys((prev) => {
      if (!prev.analyze) return prev;
      return {
        ...prev,
        analyze: "",
      };
    });
  }, [options.analyzeErrorKey, options.setAcknowledgedForensicsErrorKeys]);

  useEffect(() => {
    if (options.cleanupErrorKey) return;
    options.setAcknowledgedForensicsErrorKeys((prev) => {
      if (!prev.cleanup) return prev;
      return {
        ...prev,
        cleanup: "",
      };
    });
  }, [options.cleanupErrorKey, options.setAcknowledgedForensicsErrorKeys]);

  useEffect(() => {
    if (!options.searchThreadContext) return;
    if (options.searchThreadContext.thread_id === options.selectedThreadId) return;
    options.setSearchThreadContext(null);
  }, [options.searchThreadContext, options.selectedThreadId, options.setSearchThreadContext]);

  useEffect(() => {
    if (options.layoutView !== "threads") return;
    if (options.panelChunkWarmupStartedRef.current) return;
    if (typeof window === "undefined") return;

    options.panelChunkWarmupStartedRef.current = true;
    let cancelled = false;
    let timeoutId: number | null = null;
    let idleId: number | null = null;

    const runWarmup = () => {
      if (cancelled) return;
      preloadForensicsPanel();
      preloadThreadDetail();
    };

    const browserWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof browserWindow.requestIdleCallback === "function") {
      idleId = browserWindow.requestIdleCallback(runWarmup, { timeout: 2500 });
    } else {
      timeoutId = window.setTimeout(runWarmup, 1200);
    }

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (idleId !== null && typeof browserWindow.cancelIdleCallback === "function") {
        browserWindow.cancelIdleCallback(idleId);
      }
    };
  }, [options.layoutView, options.panelChunkWarmupStartedRef]);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName.toLowerCase();
      return target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select";
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === "1") {
        event.preventDefault();
        options.changeLayoutView("overview");
        return;
      }
      if (event.key === "2") {
        event.preventDefault();
        options.changeLayoutView("search");
        return;
      }
      if (event.key === "3") {
        event.preventDefault();
        options.changeLayoutView("threads");
        return;
      }
      if (event.key === "4") {
        event.preventDefault();
        options.changeLayoutView("providers");
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        const input =
          options.layoutView === "threads"
            ? options.threadSearchInputRef.current
            : (document.querySelector(".search-panel .search-input") as HTMLInputElement | null);
        input?.focus();
        input?.select();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [options.changeLayoutView, options.layoutView, options.threadSearchInputRef]);

  const handleProvidersIntent = () => {
    options.prefetchProvidersData();
    preloadProvidersPanel();
    preloadSessionDetail();
  };

  const handleSearchIntent = () => {
    // SearchPanel is statically imported to avoid dev-only lazy import stalls.
  };

  const handleDiagnosticsIntent = () => {
    options.prefetchRoutingData();
    preloadRoutingPanel();
  };

  const handleHeaderSearchSubmit = () => {
    const nextQuery = options.headerSearchDraft.trim();
    if (!nextQuery) return;
    options.setHeaderSearchDraft("");
    const jumpTarget = resolveHeaderSearchTarget({
      query: nextQuery,
      visibleProviderIdSet: options.visibleProviderIdSet,
      providerSessionRows: options.providerSessionRows,
      threadRows: options.visibleRows,
    });
    if (jumpTarget?.kind === "session") {
      options.setSearchThreadContext(null);
      options.setSelectedThreadId("");
      options.setProviderView(jumpTarget.providerView);
      options.setSelectedSessionPath(jumpTarget.filePath);
      options.changeLayoutView("providers");
      return;
    }
    if (jumpTarget?.kind === "thread") {
      options.setSearchThreadContext(null);
      options.setSelectedSessionPath("");
      options.setSelectedThreadId(jumpTarget.threadId);
      options.changeLayoutView("threads");
      return;
    }
    options.setHeaderSearchSeed(nextQuery);
    options.changeLayoutView("search");
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      const input = document.querySelector(".search-panel .search-input") as HTMLInputElement | null;
      input?.focus();
      input?.select();
    }, 120);
  };

  return {
    handleProvidersIntent,
    handleSearchIntent,
    handleDiagnosticsIntent,
    handleHeaderSearchSubmit,
  };
}
