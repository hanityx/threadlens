import { lazy, Suspense } from "react";
import { SurfaceSlotSkeleton } from "@/app/components/SurfaceSlotSkeleton";
import "@/features/providers/providers.css";
import { useProvidersWorkspaceProps } from "@/features/providers/hooks/useProvidersWorkspaceProps";

const ProvidersPanel = lazy(async () => {
  const mod = await import("./ProvidersPanel");
  return { default: mod.ProvidersPanel };
});

const SessionDetail = lazy(async () => {
  const mod = await import("@/features/providers/session/SessionDetail");
  return { default: mod.SessionDetail };
});

const RoutingPanel = lazy(async () => {
  const mod = await import("@/features/providers/routing/RoutingPanel");
  return { default: mod.RoutingPanel };
});

export function ProvidersWorkspace() {
  const {
    messages,
    providersDiagnosticsOpen,
    showRouting,
    onToggleDiagnostics,
    panelProps,
    sessionDetailProps,
    routingPanelProps,
    showSessionDetailSlot,
    sessionDetailKey,
  } = useProvidersWorkspaceProps();

  return (
    <section className="provider-page-stack">
      <Suspense
        fallback={<SurfaceSlotSkeleton />}
      >
        <ProvidersPanel
          {...panelProps}
          sessionDetailSlot={showSessionDetailSlot ? (
            <Suspense
              fallback={<SurfaceSlotSkeleton />}
            >
              <SessionDetail key={sessionDetailKey} {...sessionDetailProps} />
            </Suspense>
          ) : null}
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
                  <span className="session-routing-disclosure-kicker">{messages.routing.sessionSurfaceKicker}</span>
                  <span className="session-routing-disclosure-summary">
                    <strong>{messages.nav.routing}</strong>
                    <span className="session-routing-disclosure-bodycopy">
                      {providersDiagnosticsOpen
                        ? messages.routing.sessionSurfaceBodyOpen
                        : messages.routing.sessionSurfaceBodyClosed}
                    </span>
                  </span>
                </span>
                <span className="session-routing-disclosure-pill">
                  {providersDiagnosticsOpen
                    ? messages.routing.sessionSurfacePillHide
                    : messages.routing.sessionSurfacePillOpen}
                </span>
              </summary>
              <div className="panel-disclosure-body">
                {showRouting ? (
                  <Suspense
                    fallback={<SurfaceSlotSkeleton />}
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
