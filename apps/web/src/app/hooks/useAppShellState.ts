import { startTransition, useEffect, useRef, useState } from "react";
import type { DesktopRouteState } from "@/app/model/appShellBehavior";
import {
  persistDismissedUpdateVersion,
  readDismissedUpdateVersion,
  readStorageValue,
  SEARCH_DRAFT_STORAGE_KEY,
  writeStorageValue,
} from "@/shared/lib/appState";
import type { ConversationSearchHit, LayoutView, ProviderView } from "@/shared/types";
import type { ProviderProbeFilter } from "@/features/providers/model/sessionTableModel";

export function useAppShellState(options: {
  layoutView: LayoutView;
  setLayoutView: (view: LayoutView) => void;
  setProviderView: (view: ProviderView) => void;
}) {
  const { layoutView, setLayoutView, setProviderView } = options;
  const panelChunkWarmupStartedRef = useRef(false);
  const desktopRouteAppliedRef = useRef(false);
  const desktopRouteHydratingRef = useRef(false);
  const desktopRouteRef = useRef<DesktopRouteState>({
    view: "",
    provider: "",
    filePath: "",
    threadId: "",
  });
  const threadSearchInputRef = useRef<HTMLInputElement | null>(null);
  const detailLayoutRef = useRef<HTMLElement | null>(null);
  const pendingLayoutScrollRestoreRef = useRef<number | null>(null);
  const [searchThreadContext, setSearchThreadContext] = useState<ConversationSearchHit | null>(null);
  const [providerProbeFilterIntent, setProviderProbeFilterIntent] = useState<ProviderProbeFilter | null>(null);
  const [setupGuideOpen, setSetupGuideOpen] = useState(false);
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState(() =>
    readDismissedUpdateVersion(),
  );
  const [headerSearchDraft, setHeaderSearchDraft] = useState("");
  const [headerSearchSeed, setHeaderSearchSeed] = useState(() => {
    return readStorageValue([SEARCH_DRAFT_STORAGE_KEY]) ?? "";
  });
  const [acknowledgedForensicsErrorKeys, setAcknowledgedForensicsErrorKeys] = useState<{
    analyze: string;
    cleanup: string;
  }>({
    analyze: "",
    cleanup: "",
  });

  const changeLayoutView = (nextView: LayoutView) => {
    if (typeof window !== "undefined" && nextView !== layoutView) {
      pendingLayoutScrollRestoreRef.current = window.scrollY;
    }
    startTransition(() => {
      setLayoutView(nextView);
    });
  };

  const changeProviderView = (nextView: ProviderView) => {
    startTransition(() => {
      setProviderView(nextView);
    });
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pendingLayoutScrollRestoreRef.current === null) return;

    const targetY = pendingLayoutScrollRestoreRef.current;
    pendingLayoutScrollRestoreRef.current = null;

    const restore = () => {
      const maxScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo(0, Math.min(targetY, maxScrollY));
    };

    let rafTwo = 0;
    let timeoutOne = 0;
    let timeoutTwo = 0;
    const rafOne = window.requestAnimationFrame(() => {
      rafTwo = window.requestAnimationFrame(() => {
        restore();
        timeoutOne = window.setTimeout(restore, 80);
        timeoutTwo = window.setTimeout(restore, 240);
      });
    });

    return () => {
      window.cancelAnimationFrame(rafOne);
      if (rafTwo) window.cancelAnimationFrame(rafTwo);
      if (timeoutOne) window.clearTimeout(timeoutOne);
      if (timeoutTwo) window.clearTimeout(timeoutTwo);
    };
  }, [layoutView]);

  useEffect(() => {
    writeStorageValue(SEARCH_DRAFT_STORAGE_KEY, headerSearchSeed);
  }, [headerSearchSeed]);

  useEffect(() => {
    setHeaderSearchDraft("");
  }, [layoutView]);

  useEffect(() => {
    persistDismissedUpdateVersion(dismissedUpdateVersion);
  }, [dismissedUpdateVersion]);

  return {
    panelChunkWarmupStartedRef,
    desktopRouteAppliedRef,
    desktopRouteHydratingRef,
    desktopRouteRef,
    threadSearchInputRef,
    detailLayoutRef,
    searchThreadContext,
    setSearchThreadContext,
    providerProbeFilterIntent,
    setProviderProbeFilterIntent,
    setupGuideOpen,
    setSetupGuideOpen,
    dismissedUpdateVersion,
    setDismissedUpdateVersion,
    headerSearchDraft,
    setHeaderSearchDraft,
    headerSearchSeed,
    setHeaderSearchSeed,
    acknowledgedForensicsErrorKeys,
    setAcknowledgedForensicsErrorKeys,
    changeLayoutView,
    changeProviderView,
  };
}
