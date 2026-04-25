import { startTransition, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { PROVIDER_IDS } from "@threadlens/shared-contracts";
import type { ConversationSearchHit, LayoutView, ProviderSessionRow, ProviderView, ThreadRow } from "@/shared/types";
import { SEARCH_PROVIDER_STORAGE_KEY, writeStorageValue } from "@/shared/lib/appState";

const VALID_LAYOUT_VIEWS = new Set<LayoutView>(["overview", "search", "providers", "threads"]);
const VALID_PROVIDER_VIEWS = new Set<ProviderView>(["all", ...PROVIDER_IDS]);

function preloadChunk(loader: () => Promise<unknown>) {
  // Route prefetch is opportunistic. Test teardown or chunk races should not fail the app.
  void loader().catch(() => undefined);
}

const preloadProvidersPanel = () => {
  preloadChunk(() => import("@/features/providers/components/ProvidersPanel"));
};

const preloadThreadDetail = () => {
  preloadChunk(() => import("@/features/threads/components/ThreadDetail"));
};

const preloadSessionDetail = () => {
  preloadChunk(() => import("@/features/providers/session/SessionDetail"));
};

const preloadRoutingPanel = () => {
  preloadChunk(() => import("@/features/providers/routing/RoutingPanel"));
};

const preloadForensicsPanel = () => {
  preloadChunk(() => import("@/features/threads/components/ForensicsPanel"));
};

export type DesktopRouteState = {
  view: LayoutView | "";
  provider: ProviderView | "";
  sessionId: string;
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
      sessionId: string;
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

export function shouldLookupRemoteExactThreadTarget(query: string): boolean {
  const normalized = normalizeHeaderSearchToken(query);
  if (!normalized || /\s/.test(normalized)) return false;
  if (/^thread-[a-z0-9-]{8,}$/i.test(normalized)) return true;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized);
}

export const shouldLookupRemoteExactSessionTarget = shouldLookupRemoteExactThreadTarget;

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

function findUniqueExactMatch<T>(
  query: string,
  items: T[],
  keysForItem: (item: T) => Array<string | null | undefined>,
): T | null {
  const exactMatches = items.filter((item) =>
    keysForItem(item).some((key) => normalizeHeaderSearchToken(String(key || "")) === query),
  );
  if (exactMatches.length !== 1) return null;
  return exactMatches[0];
}

type SessionMatchLike = Pick<ProviderSessionRow, "provider" | "source" | "session_id" | "file_path">;

function isBackupSessionRow(row: Pick<ProviderSessionRow, "source">): boolean {
  return String(row.source || "").trim().toLowerCase() === "cleanup_backups";
}

export function resolveCanonicalExactProviderSessionMatch<T extends SessionMatchLike>(
  query: string,
  rows: T[],
): T | null {
  const exactMatches = rows.filter((row) =>
    [row.session_id, row.file_path].some(
      (key) => normalizeHeaderSearchToken(String(key || "")) === query,
    ),
  );
  if (exactMatches.length === 0) return null;
  if (exactMatches.length === 1) return exactMatches[0];
  const primaryMatches = exactMatches.filter((row) => !isBackupSessionRow(row));
  if (primaryMatches.length === 1) return primaryMatches[0];
  return null;
}

export function resolveHeaderSearchTarget(options: {
  query: string;
  visibleProviderIdSet: Set<string>;
  providerSessionRows: ProviderSessionRow[];
  threadRows: ThreadRow[];
  preferSessionExactMatch?: boolean;
}): HeaderSearchTarget | null {
  const normalizedQuery = normalizeHeaderSearchToken(options.query);
  if (!normalizedQuery) return null;

  const exactSessionMatch = resolveCanonicalExactProviderSessionMatch(
    normalizedQuery,
    options.providerSessionRows,
  );
  if (options.preferSessionExactMatch && exactSessionMatch) {
    return {
      kind: "session",
      sessionId: exactSessionMatch.session_id,
      filePath: exactSessionMatch.file_path,
      providerView: options.visibleProviderIdSet.has(exactSessionMatch.provider)
        ? (exactSessionMatch.provider as ProviderView)
        : "all",
    };
  }

  const exactThreadMatch = findUniqueExactMatch(
    normalizedQuery,
    options.threadRows,
    (row) => [row.thread_id],
  );
  if (exactThreadMatch) {
    return {
      kind: "thread",
      threadId: exactThreadMatch.thread_id,
    };
  }

  if (exactSessionMatch) {
    return {
      kind: "session",
      sessionId: exactSessionMatch.session_id,
      filePath: exactSessionMatch.file_path,
      providerView: options.visibleProviderIdSet.has(exactSessionMatch.provider)
        ? (exactSessionMatch.provider as ProviderView)
        : "all",
    };
  }

  const providerMatch = findUniquePrefixMatch(
    normalizedQuery,
    options.providerSessionRows,
    (row) => [row.session_id, row.file_path],
  );
  if (providerMatch) {
    return {
      kind: "session",
      sessionId: providerMatch.session_id,
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
    sessionId: params.get("sessionId") ?? "",
    filePath: "",
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

  if (route.view === "providers" && route.sessionId) {
    params.set("sessionId", route.sessionId);
  } else {
    params.delete("sessionId");
  }
  params.delete("filePath");

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
  if (previousRoute.view !== nextRoute.view) return true;
  if (
    previousRoute.view === "providers" &&
    nextRoute.view === "providers" &&
    previousRoute.provider !== nextRoute.provider
  ) {
    return true;
  }
  if (
    previousRoute.view === "providers" &&
    nextRoute.view === "providers" &&
    previousRoute.provider === nextRoute.provider &&
    (previousRoute.sessionId || previousRoute.filePath) !==
      (nextRoute.sessionId || nextRoute.filePath)
  ) {
    return true;
  }
  return false;
}

function matchesSelectedSessionRoute(
  route: Pick<DesktopRouteState, "sessionId" | "filePath">,
  selectedSessionId: string,
  selectedSessionPath: string,
): boolean {
  if (route.sessionId) return selectedSessionId === route.sessionId;
  if (route.filePath) return selectedSessionPath === route.filePath;
  return false;
}

export function shouldDeferDesktopRouteSync(options: {
  currentRoute: DesktopRouteState;
  layoutView: LayoutView;
  providerView: ProviderView;
  selectedSessionId: string;
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
        (!options.currentRoute.sessionId && !options.currentRoute.filePath) ||
        matchesSelectedSessionRoute(
          options.currentRoute,
          options.selectedSessionId,
          options.selectedSessionPath,
        );
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
    (options.routeHydrating &&
      options.currentRoute.view === "providers" &&
      options.layoutView === "providers" &&
      (options.currentRoute.sessionId || options.currentRoute.filePath) &&
      (
        (!options.selectedSessionId &&
          !options.selectedSessionPath &&
          (!options.currentRoute.provider ||
            options.currentRoute.provider === "all" ||
            options.providerView === options.currentRoute.provider)) ||
        (options.currentRoute.provider &&
          options.currentRoute.provider !== "all" &&
          matchesSelectedSessionRoute(
            options.currentRoute,
            options.selectedSessionId,
            options.selectedSessionPath,
          ) &&
          options.providerView !== options.currentRoute.provider)
      )) ||
    (options.routeHydrating &&
      options.currentRoute.view === "threads" &&
      options.layoutView === "threads" &&
      options.currentRoute.threadId &&
      !options.selectedThreadId),
  );
}

export function shouldDeferProviderFallback(options: {
  currentRoute: DesktopRouteState;
  visibleProviderTabs: ProviderTab[];
  routeHydrating?: boolean;
}): boolean {
  if (options.currentRoute.view !== "providers") return false;
  if (!options.currentRoute.provider || options.currentRoute.provider === "all") return false;
  const nonAllVisibleTabs = options.visibleProviderTabs.filter((tab) => tab.id !== "all");
  if (options.routeHydrating && nonAllVisibleTabs.length === 0) {
    return true;
  }
  if (!options.currentRoute.sessionId && !options.currentRoute.filePath) return false;
  return nonAllVisibleTabs.length === 0;
}

export function shouldRestoreRoutedSessionSelection(options: {
  routeHydrating?: boolean;
  layoutView: LayoutView;
  routeSessionId: string;
  routeFilePath: string;
  selectedSessionPath: string;
  providerSessionRows: Array<Pick<ProviderSessionRow, "session_id" | "file_path">>;
}) {
  if (!options.routeHydrating) return false;
  if (options.layoutView !== "providers") return false;
  if ((!options.routeSessionId && !options.routeFilePath) || options.selectedSessionPath) return false;
  return options.providerSessionRows.some((row) =>
    (options.routeSessionId && row.session_id === options.routeSessionId) ||
    row.file_path === options.routeFilePath,
  );
}

export function shouldRestoreRoutedThreadSelection(options: {
  routeHydrating?: boolean;
  layoutView: LayoutView;
  routeThreadId: string;
  selectedThreadId: string;
  visibleRows: Array<Pick<ThreadRow, "thread_id">>;
}) {
  if (!options.routeHydrating) return false;
  if (options.layoutView !== "threads") return false;
  if (!options.routeThreadId || options.selectedThreadId) return false;
  return options.visibleRows.some((row) => row.thread_id === options.routeThreadId);
}

export function isEditableTextTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const candidate = target as {
    tagName?: string;
    type?: string;
    isContentEditable?: boolean;
  };
  if (candidate.isContentEditable) return true;
  const tagName = typeof candidate.tagName === "string" ? candidate.tagName.toLowerCase() : "";
  if (tagName === "textarea" || tagName === "select") return true;
  if (tagName !== "input") return false;
  const inputType = String(candidate.type || "text").toLowerCase();
  return !["button", "checkbox", "radio", "reset", "submit"].includes(inputType);
}

export function shouldHandleGlobalSearchShortcut(options: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  target: EventTarget | null;
}): boolean {
  if (options.altKey) return false;
  if (!options.metaKey && !options.ctrlKey) return false;
  if (options.key.toLowerCase() !== "k") return false;
  return !isEditableTextTarget(options.target);
}

export function shouldApplyProviderFallback(options: {
  layoutView: LayoutView;
  providerView: ProviderView;
  visibleProviderTabs: ProviderTab[];
  visibleProviderIdSet: Set<string>;
  currentRoute: DesktopRouteState;
  routeHydrating?: boolean;
}): boolean {
  if (options.layoutView !== "providers") return false;
  if (
    options.currentRoute.view === "providers" &&
    options.currentRoute.provider &&
    options.currentRoute.provider !== "all" &&
    options.providerView === options.currentRoute.provider &&
    options.visibleProviderTabs.every((tab) => tab.id === "all")
  ) {
    return false;
  }
  if (
    shouldDeferProviderFallback({
      currentRoute: options.currentRoute,
      visibleProviderTabs: options.visibleProviderTabs,
      routeHydrating: options.routeHydrating,
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
    options.setLayoutView(routedView);
  }

  if (nextRoute.view === "providers") {
    options.setProviderView(nextRoute.provider || "all");
  }

  options.setSelectedSessionPath(
    nextRoute.view === "providers" && nextRoute.filePath ? nextRoute.filePath : "",
  );
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
  lookupExactThreadTarget?: (query: string) => Promise<{ threadId: string } | null>;
  lookupExactSessionTarget?: (
    query: string,
  ) => Promise<{ sessionId: string; filePath: string; providerView: ProviderView } | null>;
}) {
  useEffect(() => {
    if (options.desktopRouteAppliedRef.current) return;
    if (typeof window === "undefined") return;

    options.desktopRouteAppliedRef.current = true;
    const nextRoute = parseDesktopRouteSearch(window.location.search);
    options.desktopRouteRef.current = nextRoute;
    options.desktopRouteHydratingRef.current = Boolean(
      nextRoute.view ||
        nextRoute.provider ||
        nextRoute.sessionId ||
        nextRoute.filePath ||
        nextRoute.threadId,
    );

    if (
      !nextRoute.view &&
      !nextRoute.provider &&
      !nextRoute.sessionId &&
      !nextRoute.filePath &&
      !nextRoute.threadId
    ) {
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
        nextRoute.view ||
          nextRoute.provider ||
          nextRoute.sessionId ||
          nextRoute.filePath ||
          nextRoute.threadId,
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
    const selectedSessionId =
      options.providerSessionRows.find((row) => row.file_path === options.selectedSessionPath)
        ?.session_id ?? "";
    if (
      shouldDeferDesktopRouteSync({
        currentRoute,
        layoutView: options.layoutView,
        providerView: options.providerView,
        selectedSessionId,
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
      sessionId: options.layoutView === "providers" ? selectedSessionId : "",
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
    const routeSessionId = options.desktopRouteRef.current.sessionId;
    const routeFilePath = options.desktopRouteRef.current.filePath;
    if (
      !shouldRestoreRoutedSessionSelection({
        routeHydrating: options.desktopRouteHydratingRef.current,
        layoutView: options.layoutView,
        routeSessionId,
        routeFilePath,
        selectedSessionPath: options.selectedSessionPath,
        providerSessionRows: options.providerSessionRows,
      })
    ) {
      return;
    }
    const matchedRow = options.providerSessionRows.find((row) =>
      (routeSessionId && row.session_id === routeSessionId) || row.file_path === routeFilePath,
    );
    if (!matchedRow) return;
    options.setSelectedSessionPath(matchedRow.file_path);
  }, [
    options.desktopRouteRef,
    options.desktopRouteHydratingRef,
    options.layoutView,
    options.providerSessionRows,
    options.selectedSessionPath,
    options.setSelectedSessionPath,
  ]);

  useEffect(() => {
    const routeThreadId = options.desktopRouteRef.current.threadId;
    if (
      !shouldRestoreRoutedThreadSelection({
        routeHydrating: options.desktopRouteHydratingRef.current,
        layoutView: options.layoutView,
        routeThreadId,
        selectedThreadId: options.selectedThreadId,
        visibleRows: options.visibleRows,
      })
    ) {
      return;
    }
    options.setSelectedThreadId(routeThreadId);
  }, [
    options.desktopRouteRef,
    options.desktopRouteHydratingRef,
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

    options.setProviderView(routedProvider);
  }, [options.providerView, options.setProviderView, options.visibleProviderTabs, options.desktopRouteRef]);

  useEffect(() => {
    if (
      !shouldApplyProviderFallback({
        layoutView: options.layoutView,
        providerView: options.providerView,
        visibleProviderTabs: options.visibleProviderTabs,
        visibleProviderIdSet: options.visibleProviderIdSet,
        currentRoute: options.desktopRouteRef.current,
        routeHydrating: options.desktopRouteHydratingRef.current,
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      if (
        shouldHandleGlobalSearchShortcut({
          key: event.key,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          target: event.target,
        })
      ) {
        event.preventDefault();
        const input = document.querySelector(".top-search-input") as HTMLInputElement | null;
        input?.focus();
        input?.select();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTextTarget(event.target)) return;

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
        options.setSelectedSessionPath("");
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

  const handleHeaderSearchSubmit = async () => {
    const nextQuery = options.headerSearchDraft.trim();
    if (!nextQuery) return;
    options.setHeaderSearchDraft("");
    const preferSessionExactMatch = options.layoutView === "providers";
    const jumpTarget = resolveHeaderSearchTarget({
      query: nextQuery,
      visibleProviderIdSet: options.visibleProviderIdSet,
      providerSessionRows: options.providerSessionRows,
      threadRows: options.visibleRows,
      preferSessionExactMatch,
    });
    if (jumpTarget?.kind === "session") {
      if (typeof window !== "undefined") {
        const nextSearch = buildDesktopRouteSearch(window.location.search, {
          view: "providers",
          provider: jumpTarget.providerView,
          sessionId: jumpTarget.sessionId,
          filePath: jumpTarget.filePath,
          threadId: "",
        });
        const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
        window.history.pushState(null, "", nextUrl);
      }
      options.setSearchThreadContext(null);
      options.setSelectedThreadId("");
      options.setProviderView(jumpTarget.providerView);
      options.setSelectedSessionPath(jumpTarget.filePath);
      options.changeLayoutView("providers");
      return;
    }

    if (preferSessionExactMatch && options.lookupExactSessionTarget && shouldLookupRemoteExactSessionTarget(nextQuery)) {
      const remoteSessionTarget = await options.lookupExactSessionTarget(nextQuery);
      if (remoteSessionTarget?.sessionId && remoteSessionTarget.filePath) {
        if (typeof window !== "undefined") {
          const nextSearch = buildDesktopRouteSearch(window.location.search, {
            view: "providers",
            provider: remoteSessionTarget.providerView,
            sessionId: remoteSessionTarget.sessionId,
            filePath: remoteSessionTarget.filePath,
            threadId: "",
          });
          const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
          window.history.pushState(null, "", nextUrl);
        }
        options.setSearchThreadContext(null);
        options.setSelectedThreadId("");
        options.setProviderView(remoteSessionTarget.providerView);
        options.setSelectedSessionPath(remoteSessionTarget.filePath);
        options.changeLayoutView("providers");
        return;
      }
    }

    if (jumpTarget?.kind === "thread") {
      options.setSearchThreadContext(null);
      options.setSelectedSessionPath("");
      options.setSelectedThreadId(jumpTarget.threadId);
      options.changeLayoutView("threads");
      return;
    }

    if (options.lookupExactThreadTarget && shouldLookupRemoteExactThreadTarget(nextQuery)) {
      const remoteThreadTarget = await options.lookupExactThreadTarget(nextQuery);
      if (remoteThreadTarget?.threadId) {
        if (typeof window !== "undefined") {
          const nextSearch = buildDesktopRouteSearch(window.location.search, {
            view: "threads",
            provider: "",
            sessionId: "",
            filePath: "",
            threadId: remoteThreadTarget.threadId,
          });
          const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
          window.history.pushState(null, "", nextUrl);
        }
        options.setSearchThreadContext(null);
        options.setSelectedSessionPath("");
        options.setSelectedThreadId(remoteThreadTarget.threadId);
        options.changeLayoutView("threads");
        return;
      }
    }

    if (!preferSessionExactMatch && options.lookupExactSessionTarget && shouldLookupRemoteExactSessionTarget(nextQuery)) {
      const remoteSessionTarget = await options.lookupExactSessionTarget(nextQuery);
      if (remoteSessionTarget?.sessionId && remoteSessionTarget.filePath) {
        if (typeof window !== "undefined") {
          const nextSearch = buildDesktopRouteSearch(window.location.search, {
            view: "providers",
            provider: remoteSessionTarget.providerView,
            sessionId: remoteSessionTarget.sessionId,
            filePath: remoteSessionTarget.filePath,
            threadId: "",
          });
          const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
          window.history.pushState(null, "", nextUrl);
        }
        options.setSearchThreadContext(null);
        options.setSelectedThreadId("");
        options.setProviderView(remoteSessionTarget.providerView);
        options.setSelectedSessionPath(remoteSessionTarget.filePath);
        options.changeLayoutView("providers");
        return;
      }
    }

    options.setHeaderSearchSeed(nextQuery);
    writeStorageValue(SEARCH_PROVIDER_STORAGE_KEY, "all");
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
