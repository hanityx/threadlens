import { useDeferredValue, useEffect, useReducer, useRef, useState } from "react";
import type { ProviderView } from "@/shared/types";
import {
  buildHardDeleteConfirmRequestState,
  buildHardDeleteConfirmResolvedState,
  readProviderHardDeleteSkipConfirmPref,
  writeProviderHardDeleteSkipConfirmPref,
} from "@/features/providers/model/hardDeleteConfirmModel";
import {
  createParserWorkspaceState,
  parserWorkspaceReducer,
} from "@/features/providers/parser/parserWorkspaceModel";
import {
  clearSlowOnlyPref,
  readCsvColumnPrefs,
  writeCsvColumnPrefs,
  type CsvColumnKey,
} from "@/features/providers/lib/helpers";
import type {
  ProviderProbeFilter,
  ProviderSessionSort,
  ProviderSourceFilter,
} from "@/features/providers/model/sessionTableModel";

export function useProvidersPanelState(options: {
  providerView: ProviderView;
  sessionFilter: string;
  sessionSort: ProviderSessionSort;
  probeFilter: ProviderProbeFilter;
  sourceFilter: ProviderSourceFilter;
  sourceFilterOptions: Array<{ source: string; count: number }>;
  providerProbeFilterIntent: ProviderProbeFilter | null;
  setProviderProbeFilterIntent: (value: ProviderProbeFilter | null) => void;
  canRunProviderAction: boolean;
  busy: boolean;
  runProviderHardDelete: () => Promise<unknown>;
}) {
  const {
    providerView,
    sessionFilter,
    sessionSort,
    probeFilter,
    sourceFilter,
    sourceFilterOptions,
    providerProbeFilterIntent,
    setProviderProbeFilterIntent,
    canRunProviderAction,
    busy,
    runProviderHardDelete,
  } = options;

  const [localSessionFilter, setLocalSessionFilter] = useState(sessionFilter);
  const deferredSessionFilter = useDeferredValue(localSessionFilter);
  const [localSessionSort, setLocalSessionSort] = useState<ProviderSessionSort>(sessionSort);
  const [localProbeFilter, setLocalProbeFilter] = useState<ProviderProbeFilter>(probeFilter);
  const [localSourceFilter, setLocalSourceFilter] = useState<ProviderSourceFilter>(sourceFilter);
  const [renderLimit, setRenderLimit] = useState(80);
  const [csvExportedRows, setCsvExportedRows] = useState<number | null>(null);
  const [parserWorkspace, dispatchParserWorkspace] = useReducer(
    parserWorkspaceReducer,
    undefined,
    createParserWorkspaceState,
  );
  const [slowOnly, setSlowOnly] = useState(false);
  const [hotspotScopeOrigin, setHotspotScopeOrigin] = useState<ProviderView | null>(null);
  const [csvColumns, setCsvColumns] = useState<Record<CsvColumnKey, boolean>>(readCsvColumnPrefs);
  const providerSessionsSectionRef = useRef<HTMLElement | null>(null);
  const providerSideStackRef = useRef<HTMLElement | null>(null);
  const activeSessionPanelBaselineRef = useRef<number | null>(null);
  const parserSectionRef = useRef<HTMLDetailsElement | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [activeSessionPanelHeight, setActiveSessionPanelHeight] = useState<number | null>(null);
  const [hardDeleteConfirmOpen, setHardDeleteConfirmOpen] = useState(false);
  const [hardDeleteSkipConfirmChecked, setHardDeleteSkipConfirmChecked] = useState(false);
  const [hardDeleteSkipConfirmPref, setHardDeleteSkipConfirmPref] = useState(
    readProviderHardDeleteSkipConfirmPref,
  );

  useEffect(() => {
    if (localSourceFilter === "all") return;
    const exists = sourceFilterOptions.some((item) => item.source === localSourceFilter);
    if (!exists) setLocalSourceFilter("all");
  }, [localSourceFilter, sourceFilterOptions]);

  useEffect(() => {
    clearSlowOnlyPref();
  }, []);

  useEffect(() => {
    setRenderLimit(80);
  }, [providerView, localSessionFilter, localSessionSort, localProbeFilter, localSourceFilter]);

  useEffect(() => {
    if (providerProbeFilterIntent === null) return;
    setLocalProbeFilter(providerProbeFilterIntent);
    setProviderProbeFilterIntent(null);
  }, [providerProbeFilterIntent, setProviderProbeFilterIntent]);

  useEffect(() => {
    writeCsvColumnPrefs(csvColumns);
  }, [csvColumns]);

  const resetHardDeleteConfirmState = () => {
    const next = buildHardDeleteConfirmResolvedState(hardDeleteSkipConfirmPref);
    setHardDeleteConfirmOpen(next.confirmOpen);
    setHardDeleteSkipConfirmChecked(next.skipConfirmChecked);
  };

  const openHardDeleteConfirm = () => {
    const next = buildHardDeleteConfirmRequestState({
      enabled: canRunProviderAction && !busy,
      skipConfirmPref: hardDeleteSkipConfirmPref,
    });
    if (next.shouldRunImmediately) {
      void runProviderHardDelete();
      return;
    }
    setHardDeleteSkipConfirmChecked(next.skipConfirmChecked);
    setHardDeleteConfirmOpen(next.confirmOpen);
  };

  const confirmHardDelete = () => {
    if (busy) return;
    writeProviderHardDeleteSkipConfirmPref(hardDeleteSkipConfirmChecked);
    const next = buildHardDeleteConfirmResolvedState(hardDeleteSkipConfirmChecked);
    setHardDeleteSkipConfirmPref(next.skipConfirmPref);
    setHardDeleteConfirmOpen(next.confirmOpen);
    void runProviderHardDelete().finally(() => {
      setHardDeleteSkipConfirmChecked(next.skipConfirmChecked);
    });
  };

  return {
    sessionFilter: localSessionFilter,
    setSessionFilter: setLocalSessionFilter,
    deferredSessionFilter,
    sessionSort: localSessionSort,
    setSessionSort: setLocalSessionSort,
    probeFilter: localProbeFilter,
    setProbeFilter: setLocalProbeFilter,
    sourceFilter: localSourceFilter,
    setSourceFilter: setLocalSourceFilter,
    renderLimit,
    setRenderLimit,
    csvExportedRows,
    setCsvExportedRows,
    parserWorkspace,
    dispatchParserWorkspace,
    slowOnly,
    setSlowOnly,
    hotspotScopeOrigin,
    setHotspotScopeOrigin,
    csvColumns,
    setCsvColumns,
    providerSessionsSectionRef,
    providerSideStackRef,
    activeSessionPanelBaselineRef,
    parserSectionRef,
    advancedOpen,
    setAdvancedOpen,
    activeSessionPanelHeight,
    setActiveSessionPanelHeight,
    hardDeleteConfirmOpen,
    hardDeleteSkipConfirmChecked,
    setHardDeleteSkipConfirmChecked,
    hardDeleteSkipConfirmPref,
    resetHardDeleteConfirmState,
    openHardDeleteConfirm,
    confirmHardDelete,
  };
}
