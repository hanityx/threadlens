import { createContext, useContext, type MutableRefObject } from "react";
import type { useAppData } from "../hooks/useAppData";
import type { useAppShellModel } from "./appShellModel";
import type { useAppShellBehavior } from "./appShellBehavior";
import type { Messages } from "../i18n";
import type { ConversationSearchHit, LayoutView, ProviderView } from "../types";

type RuntimeBackend = { reachable?: boolean; latency_ms?: number | null; url?: string };

type AppLocalState = {
  messages: Messages;
  providersDiagnosticsOpen: boolean;
  setProvidersDiagnosticsOpen: (open: boolean) => void;
  setupGuideOpen: boolean;
  setSetupGuideOpen: (open: boolean) => void;
  headerSearchDraft: string;
  setHeaderSearchDraft: (v: string) => void;
  headerSearchSeed: string;
  searchThreadContext: ConversationSearchHit | null;
  setSearchThreadContext: (hit: ConversationSearchHit | null) => void;
  acknowledgedForensicsErrorKeys: { analyze: string; cleanup: string };
  setAcknowledgedForensicsErrorKeys: React.Dispatch<React.SetStateAction<{ analyze: string; cleanup: string }>>;
  changeLayoutView: (view: LayoutView) => void;
  changeProviderView: (view: ProviderView) => void;
  showRuntimeBackendDegraded: boolean;
  emptySessionScopeLabel: string;
  analyzeErrorKey: string;
  cleanupErrorKey: string;
  runtimeBackend: RuntimeBackend | undefined;
  threadSearchInputRef: MutableRefObject<HTMLInputElement | null>;
  detailLayoutRef: MutableRefObject<HTMLElement | null>;
};

export type AppContextValue =
  ReturnType<typeof useAppData> &
  ReturnType<typeof useAppShellModel> &
  ReturnType<typeof useAppShellBehavior> &
  AppLocalState;

export const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext must be used within AppContext.Provider");
  return ctx;
}
