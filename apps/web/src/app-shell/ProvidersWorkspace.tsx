import { lazy, Suspense } from "react";
import type { ExecutionGraphData } from "@threadlens/shared-contracts";
import type { Messages } from "../i18n";
import type { ProvidersPanelProps } from "../components/ProvidersPanel";
import type { SessionDetailProps } from "../components/SessionDetail";
import type {
  ProviderParserHealthReport,
  ProviderSessionRow,
  ProviderView,
} from "../types";

const ProvidersPanel = lazy(async () => {
  const mod = await import("../components/ProvidersPanel");
  return { default: mod.ProvidersPanel };
});

const SessionDetail = lazy(async () => {
  const mod = await import("../components/SessionDetail");
  return { default: mod.SessionDetail };
});

const RoutingPanel = lazy(async () => {
  const mod = await import("../components/RoutingPanel");
  return { default: mod.RoutingPanel };
});

type ProvidersWorkspaceProps = {
  messages: Messages;
  panelProps: Omit<ProvidersPanelProps, "sessionDetailSlot" | "diagnosticsSlot">;
  sessionDetailKey: string;
  sessionDetailProps: SessionDetailProps;
  providersDiagnosticsOpen: boolean;
  onToggleDiagnostics: (nextOpen: boolean) => void;
  showRouting: boolean;
  routingPanelProps: {
    messages: Messages;
    data: ExecutionGraphData | null | undefined;
    loading: boolean;
    providerView: ProviderView;
    providerSessionRows: ProviderSessionRow[];
    parserReports: ProviderParserHealthReport[];
    visibleProviderIds?: string[];
  };
};

export function ProvidersWorkspace(props: ProvidersWorkspaceProps) {
  const {
    messages,
    panelProps,
    sessionDetailKey,
    sessionDetailProps,
    providersDiagnosticsOpen,
    onToggleDiagnostics,
    showRouting,
    routingPanelProps,
  } = props;

  return (
    <section className="provider-page-stack">
      <Suspense
        fallback={
          <section className="panel">
            <header>
              <h2>{messages.nav.providers}</h2>
              <span>{messages.common.loading}</span>
            </header>
            <div className="sub-toolbar">
              <div className="skeleton-line" />
            </div>
          </section>
        }
      >
        <ProvidersPanel
          {...panelProps}
          sessionDetailSlot={
            <Suspense
              fallback={
                <section className="panel">
                  <header>
                    <h2>{messages.sessionDetail.title}</h2>
                    <span>{messages.common.loading}</span>
                  </header>
                  <div className="sub-toolbar">
                    <div className="skeleton-line" />
                  </div>
                </section>
              }
            >
              <SessionDetail key={sessionDetailKey} {...sessionDetailProps} />
            </Suspense>
          }
          diagnosticsSlot={
            <details
              className="panel panel-disclosure session-routing-disclosure"
              open={providersDiagnosticsOpen}
              onToggle={(event) => {
                onToggleDiagnostics((event.currentTarget as HTMLDetailsElement).open);
              }}
            >
              <summary>
                <span className="session-routing-disclosure-copy">
                  <span className="session-routing-disclosure-kicker">Session surface</span>
                  <span className="session-routing-disclosure-summary">
                    <strong>{messages.nav.routing}</strong>
                    <span className="session-routing-disclosure-bodycopy">
                      {providersDiagnosticsOpen
                        ? "Paths, findings, and execution flow for the current AI."
                        : "Open paths, findings, and execution flow without leaving Sessions."}
                    </span>
                  </span>
                </span>
                <span className="session-routing-disclosure-pill">
                  {providersDiagnosticsOpen ? "Hide" : "Open"}
                </span>
              </summary>
              <div className="panel-disclosure-body">
                {showRouting ? (
                  <Suspense
                    fallback={
                      <section className="panel">
                        <header>
                          <h2>{messages.nav.routing}</h2>
                          <span>{messages.common.loading}</span>
                        </header>
                        <div className="sub-toolbar">
                          <div className="skeleton-line" />
                        </div>
                      </section>
                    }
                  >
                    <RoutingPanel {...routingPanelProps} />
                  </Suspense>
                ) : null}
              </div>
            </details>
          }
        />
      </Suspense>
    </section>
  );
}
