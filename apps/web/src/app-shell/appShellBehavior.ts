import { startTransition, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { ConversationSearchHit, LayoutView, ProviderView } from "../types";
import { normalizeDesktopRouteFilePath } from "./desktopRoute";

const VALID_LAYOUT_VIEWS = new Set<LayoutView>(["overview", "search", "providers", "threads"]);
const VALID_PROVIDER_VIEWS = new Set(["all", "codex", "claude", "gemini", "copilot", "chatgpt"]);

const preloadProvidersPanel = () => {
  void import("../components/ProvidersPanel");
};

const preloadSearchPanel = () => {
  void import("../components/SearchPanel");
};

const preloadThreadDetail = () => {
  void import("../components/ThreadDetail");
};

const preloadSessionDetail = () => {
  void import("../components/SessionDetail");
};

const preloadRoutingPanel = () => {
  void import("../components/RoutingPanel");
};

const preloadForensicsPanel = () => {
  void import("../components/ForensicsPanel");
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
  desktopRouteRef: MutableRefObject<DesktopRouteState>;
  changeLayoutView: (nextView: LayoutView) => void;
  setLayoutView: Dispatch<SetStateAction<LayoutView>>;
  setProviderView: Dispatch<SetStateAction<ProviderView>>;
  setSelectedSessionPath: Dispatch<SetStateAction<string>>;
  setSelectedThreadId: Dispatch<SetStateAction<string>>;
  setAcknowledgedForensicsErrorKeys: Dispatch<SetStateAction<AcknowledgedForensicsErrorKeys>>;
  setSearchThreadContext: Dispatch<SetStateAction<ConversationSearchHit | null>>;
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

    if (!nextRoute.view && !nextRoute.provider && !nextRoute.filePath && !nextRoute.threadId) {
      return;
    }

    const routedView = nextRoute.view;
    if (routedView) {
      startTransition(() => {
        options.setLayoutView(routedView);
      });
    }

    const routedProvider = nextRoute.provider;
    if (routedProvider) {
      startTransition(() => {
        options.setProviderView(routedProvider);
      });
    }

    if (nextRoute.filePath) {
      options.setSelectedSessionPath(nextRoute.filePath);
      if (nextRoute.view !== "threads") {
        startTransition(() => {
          options.setLayoutView("providers");
        });
      }
    }

    if (nextRoute.threadId) {
      options.setSelectedThreadId(nextRoute.threadId);
      startTransition(() => {
        options.setLayoutView("threads");
      });
    }
  }, [
    options.desktopRouteAppliedRef,
    options.desktopRouteRef,
    options.setLayoutView,
    options.setProviderView,
    options.setSelectedSessionPath,
    options.setSelectedThreadId,
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
    preloadSearchPanel();
  };

  const handleDiagnosticsIntent = () => {
    options.prefetchRoutingData();
    preloadRoutingPanel();
  };

  const handleHeaderSearchSubmit = () => {
    const nextQuery = options.headerSearchDraft.trim();
    if (!nextQuery) return;
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
