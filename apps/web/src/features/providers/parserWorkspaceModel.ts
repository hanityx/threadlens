import type { ProviderParserHealthReport, ProviderSessionRow } from "../../types";
import { buildParserDetailState, filterParserReports, sortParserReports, type ParserSort } from "./parserModel";
import {
  buildJumpToParserProviderState,
  buildJumpToSessionFromParserErrorState,
  type ParserJumpStatus,
  type PendingSessionJump,
} from "./providerJumpModel";

export type ParserWorkspaceState = {
  parserDetailProvider: string;
  parserFailOnly: boolean;
  parserSort: ParserSort;
  pendingParserFocusProvider: string;
  parserJumpStatus: ParserJumpStatus;
  pendingSessionJump: PendingSessionJump | null;
};

export type ParserWorkspaceAction =
  | { type: "set_parser_detail_provider"; providerId: string }
  | { type: "set_parser_fail_only"; value: boolean }
  | { type: "set_parser_sort"; value: ParserSort }
  | { type: "sync_resolved_parser_detail_provider"; providerId: string }
  | { type: "jump_to_parser_provider"; providerId: string }
  | { type: "jump_to_session_from_parser_error"; providerId: string; sessionId: string }
  | { type: "resolve_pending_session_jump"; parserJumpStatus: ParserJumpStatus }
  | { type: "clear_pending_parser_focus" };

export function createParserWorkspaceState(): ParserWorkspaceState {
  return {
    parserDetailProvider: "",
    parserFailOnly: false,
    parserSort: "fail_desc",
    pendingParserFocusProvider: "",
    parserJumpStatus: "idle",
    pendingSessionJump: null,
  };
}

export function parserWorkspaceReducer(
  state: ParserWorkspaceState,
  action: ParserWorkspaceAction,
): ParserWorkspaceState {
  if (action.type === "set_parser_detail_provider") {
    return { ...state, parserDetailProvider: action.providerId };
  }
  if (action.type === "set_parser_fail_only") {
    return { ...state, parserFailOnly: action.value };
  }
  if (action.type === "set_parser_sort") {
    return { ...state, parserSort: action.value };
  }
  if (action.type === "sync_resolved_parser_detail_provider") {
    if (state.parserDetailProvider === action.providerId) return state;
    return { ...state, parserDetailProvider: action.providerId };
  }
  if (action.type === "jump_to_parser_provider") {
    const next = buildJumpToParserProviderState(action.providerId);
    if (!next) return state;
    return {
      ...state,
      parserFailOnly: next.parserFailOnly,
      parserDetailProvider: next.parserDetailProvider,
      pendingParserFocusProvider: next.pendingParserFocusProvider,
    };
  }
  if (action.type === "jump_to_session_from_parser_error") {
    const next = buildJumpToSessionFromParserErrorState(action);
    return {
      ...state,
      parserDetailProvider: next.parserDetailProvider,
      pendingSessionJump: next.pendingSessionJump,
      parserJumpStatus: next.parserJumpStatus,
    };
  }
  if (action.type === "resolve_pending_session_jump") {
    return {
      ...state,
      pendingSessionJump: null,
      parserJumpStatus: action.parserJumpStatus,
    };
  }
  if (action.type === "clear_pending_parser_focus") {
    return {
      ...state,
      pendingParserFocusProvider: "",
    };
  }
  return state;
}

export function buildParserWorkspaceView(options: {
  state: ParserWorkspaceState;
  parserReports: ProviderParserHealthReport[];
  providerSessionRows: ProviderSessionRow[];
  selectedSessionPath: string;
  effectiveSlowOnly: boolean;
  slowProviderSet: ReadonlySet<string>;
}) {
  const filteredParserReports = filterParserReports(options.parserReports, {
    parserFailOnly: options.state.parserFailOnly,
    effectiveSlowOnly: options.effectiveSlowOnly,
    slowProviderSet: options.slowProviderSet,
  });
  const sortedParserReports = sortParserReports(filteredParserReports, options.state.parserSort);
  const detailState = buildParserDetailState({
    sortedParserReports,
    parserDetailProvider: options.state.parserDetailProvider,
    providerSessionRows: options.providerSessionRows,
    selectedSessionPath: options.selectedSessionPath,
  });

  return {
    filteredParserReports,
    sortedParserReports,
    ...detailState,
  };
}
