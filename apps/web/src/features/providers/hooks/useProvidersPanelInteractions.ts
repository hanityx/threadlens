import { useEffect, useMemo } from "react";
import {
  buildHotspotOriginLabel,
  buildJumpToParserProviderState,
  buildJumpToProviderSessionsState,
  buildJumpToSessionFromParserErrorState,
  canFocusPendingParserProvider,
  resolvePendingSessionJump,
} from "@/features/providers/model/providerJumpModel";
import { buildProviderCsvExportData } from "@/features/providers/model/providerCsvModel";
import type { ProvidersPanelProps } from "@/features/providers/components/ProvidersPanel";
import type { useProvidersPanelState } from "@/features/providers/hooks/useProvidersPanelState";
import type { useProvidersPanelDerived } from "@/features/providers/hooks/useProvidersPanelDerived";

const SESSION_PANEL_ACTIVE_MIN_HEIGHT = 640;

export function resolveSessionPanelHeight(options: {
  detailHeight?: number | null;
  stackHeight?: number | null;
  baselineHeight?: number | null;
  minHeight?: number;
}) {
  const {
    detailHeight = null,
    stackHeight = null,
    baselineHeight = null,
    minHeight = SESSION_PANEL_ACTIVE_MIN_HEIGHT,
  } = options;
  const measuredHeight = Math.max(Number(stackHeight || 0), Number(detailHeight || 0));
  return Math.max(minHeight, Number(baselineHeight || 0), Math.ceil(measuredHeight));
}

export function useProvidersPanelInteractions(options: {
  props: ProvidersPanelProps;
  state: ReturnType<typeof useProvidersPanelState>;
  derived: ReturnType<typeof useProvidersPanelDerived>;
}) {
  const { props, state, derived } = options;

  useEffect(() => {
    if (state.parserWorkspace.parserDetailProvider !== derived.parserModel.resolvedParserDetailProvider) {
      state.dispatchParserWorkspace({
        type: "sync_resolved_parser_detail_provider",
        providerId: derived.parserModel.resolvedParserDetailProvider,
      });
    }
  }, [
    state.parserWorkspace.parserDetailProvider,
    derived.parserModel.resolvedParserDetailProvider,
    state.dispatchParserWorkspace,
  ]);

  const exportFilteredSessionsCsv = () => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const exportData = buildProviderCsvExportData({
      rows: derived.sessionModel.sortedProviderSessionRows,
      enabledColumns: derived.sessionModel.enabledCsvColumns,
      providerView: props.providerView,
      stamp,
    });
    const blob = new Blob([exportData.payload], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exportData.filename;
    anchor.click();
    URL.revokeObjectURL(url);
    state.setCsvExportedRows(exportData.exportedRows);
  };

  const jumpToProviderSessions = (
    providerId: string,
    parseFail = 0,
    options?: { fromHotspot?: boolean },
  ) => {
    const next = buildJumpToProviderSessionsState({
      currentProviderView: props.providerView,
      providerId,
      parseFail,
      fromHotspot: options?.fromHotspot,
    });
    state.setHotspotScopeOrigin(next.hotspotScopeOrigin);
    props.setProviderView(next.providerView);
    state.setProbeFilter(next.probeFilter);
    state.dispatchParserWorkspace({
      type: "set_parser_detail_provider",
      providerId: next.parserDetailProvider,
    });
    state.setSessionFilter(next.sessionFilter);
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        state.providerSessionsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  };

  const scrollToSessionRow = (filePath: string) => {
    if (typeof window === "undefined") return;
    const key = encodeURIComponent(filePath);
    window.setTimeout(() => {
      const row = document.querySelector(`tr[data-file-key="${key}"]`);
      if (row instanceof HTMLElement) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      state.providerSessionsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const scrollToParserProviderRow = (providerId: string) => {
    if (typeof window === "undefined") return;
    const key = encodeURIComponent(providerId);
    window.setTimeout(() => {
      const row = document.querySelector(`tr[data-parser-provider-key="${key}"]`);
      if (row instanceof HTMLElement) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        row.focus({ preventScroll: true });
        return;
      }
      state.parserSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const jumpToParserProvider = (providerId: string) => {
    const next = buildJumpToParserProviderState(providerId);
    if (!next) return;
    state.setAdvancedOpen(next.advancedOpen);
    state.dispatchParserWorkspace({
      type: "jump_to_parser_provider",
      providerId: next.parserDetailProvider,
    });
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        state.parserSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  };

  const jumpToSessionFromParserError = (providerId: string, sessionId: string) => {
    const next = buildJumpToSessionFromParserErrorState({ providerId, sessionId });
    state.setHotspotScopeOrigin(next.hotspotScopeOrigin);
    props.setProviderView(next.providerView);
    state.setProbeFilter(next.probeFilter);
    state.setSessionFilter(next.sessionFilter);
    state.dispatchParserWorkspace({
      type: "jump_to_session_from_parser_error",
      providerId: next.parserDetailProvider,
      sessionId: next.pendingSessionJump.sessionId,
    });
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        state.providerSessionsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  };

  useEffect(() => {
    const resolved = resolvePendingSessionJump({
      pendingSessionJump: state.parserWorkspace.pendingSessionJump,
      providerView: props.providerView,
      providerSessionsLoading: props.providerSessionsLoading,
      providerSessionRows: props.providerSessionRows,
    });
    if (!resolved) return;
    if (resolved.selectedSessionPath) {
      props.setSelectedSessionPath(resolved.selectedSessionPath);
      state.dispatchParserWorkspace({
        type: "resolve_pending_session_jump",
        parserJumpStatus: resolved.parserJumpStatus,
      });
      scrollToSessionRow(resolved.selectedSessionPath);
    } else {
      state.dispatchParserWorkspace({
        type: "resolve_pending_session_jump",
        parserJumpStatus: resolved.parserJumpStatus,
      });
    }
  }, [
    state.parserWorkspace.pendingSessionJump,
    props.providerView,
    props.providerSessionsLoading,
    props.providerSessionRows,
    props.setSelectedSessionPath,
    state.dispatchParserWorkspace,
  ]);

  useEffect(() => {
    if (!canFocusPendingParserProvider(state.parserWorkspace.pendingParserFocusProvider, derived.parserModel.sortedParserReports)) return;
    scrollToParserProviderRow(state.parserWorkspace.pendingParserFocusProvider);
    state.dispatchParserWorkspace({ type: "clear_pending_parser_focus" });
  }, [state.parserWorkspace.pendingParserFocusProvider, derived.parserModel.sortedParserReports, state.dispatchParserWorkspace]);

  useEffect(() => {
    if (!props.selectedSessionPath || !state.providerSideStackRef.current) {
      state.setActiveSessionPanelHeight(null);
      state.activeSessionPanelBaselineRef.current = null;
      return;
    }

    state.activeSessionPanelBaselineRef.current = null;

    const stackTarget = state.providerSideStackRef.current;
    const detailTarget = stackTarget.querySelector<HTMLElement>(".session-detail-panel");
    let frameId = 0;

    const syncHeight = () => {
      const nextHeight = resolveSessionPanelHeight({
        stackHeight: stackTarget.getBoundingClientRect().height,
        detailHeight: detailTarget?.getBoundingClientRect().height ?? null,
        baselineHeight: state.activeSessionPanelBaselineRef.current,
      });
      state.activeSessionPanelBaselineRef.current = Math.max(state.activeSessionPanelBaselineRef.current ?? 0, nextHeight);
      const resolvedHeight = Math.max(nextHeight, state.activeSessionPanelBaselineRef.current);
      state.setActiveSessionPanelHeight((current) => (current === resolvedHeight ? current : resolvedHeight));
    };

    syncHeight();

    const observer = new ResizeObserver(() => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        frameId = 0;
        syncHeight();
      });
    });

    observer.observe(stackTarget);
    if (detailTarget && detailTarget !== stackTarget) {
      observer.observe(detailTarget);
    }

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [props.selectedSessionPath, state.advancedOpen, state.providerSideStackRef, state.setActiveSessionPanelHeight, state.activeSessionPanelBaselineRef]);

  const hotspotOriginLabel = useMemo(
    () =>
      buildHotspotOriginLabel({
        hotspotScopeOrigin: state.hotspotScopeOrigin,
        providerTabById: derived.workbenchModel.providerTabById,
        allAiLabel: props.messages.common.allAi,
      }),
    [state.hotspotScopeOrigin, derived.workbenchModel.providerTabById, props.messages.common.allAi],
  );

  const focusSlowProviders = () => {
    props.setProviderView("all");
    state.setSlowOnly(true);
    state.setHotspotScopeOrigin(null);
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        state.providerSessionsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 0);
    }
  };

  const clearSlowFocus = () => {
    state.setSlowOnly(false);
  };

  return {
    hotspotOriginLabel,
    actions: {
      exportFilteredSessionsCsv,
      jumpToProviderSessions,
      jumpToParserProvider,
      jumpToSessionFromParserError,
      focusSlowProviders,
      clearSlowFocus,
    },
  };
}
