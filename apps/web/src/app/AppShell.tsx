import { lazy, Suspense } from "react";
import type { UpdateCheckStatus } from "@threadlens/shared-contracts";
import { DetailShell } from "@/app/components/DetailShell";
import {
  RuntimeFeedbackStack,
  type RuntimeFeedbackStackProps,
} from "@/app/components/RuntimeFeedbackStack";
import { TopShell, type TopShellProps } from "@/app/components/TopShell";
import { UpdateBanner } from "@/app/components/UpdateBanner";
import type { Messages } from "@/i18n";
import type { LayoutView } from "@/shared/types";
import { PanelHeader } from "@/shared/ui/components/PanelHeader";

const OverviewWorkbench = lazy(async () => {
  const mod = await import("@/features/overview/components/OverviewWorkbench");
  return { default: mod.OverviewWorkbench };
});

const ProvidersWorkspace = lazy(async () => {
  const mod = await import("@/features/providers/components/ProvidersWorkspace");
  return { default: mod.ProvidersWorkspace };
});

const SearchRoute = lazy(async () => {
  const mod = await import("@/features/search/components/SearchRoute");
  return { default: mod.SearchRoute };
});

const ThreadsWorkbench = lazy(async () => {
  const mod = await import("@/features/threads/components/ThreadsWorkbench");
  return { default: mod.ThreadsWorkbench };
});

type RuntimeBackend = {
  reachable?: boolean;
  latency_ms?: number | null;
  url?: string;
};

export function AppShell(props: {
  messages: Messages;
  layoutView: LayoutView;
  showSearch: boolean;
  showProviders: boolean;
  showThreadsTable: boolean;
  topShellProps: TopShellProps;
  runtimeFeedbackProps: RuntimeFeedbackStackProps;
  showRuntimeBackendDegraded: boolean;
  runtimeBackend?: RuntimeBackend;
  showUpdateBanner: boolean;
  updateCheckData: UpdateCheckStatus | null;
  onDismissUpdate: (version: string) => void;
}) {
  const {
    messages,
    layoutView,
    showSearch,
    showProviders,
    showThreadsTable,
    topShellProps,
    runtimeFeedbackProps,
    showRuntimeBackendDegraded,
    runtimeBackend,
    showUpdateBanner,
    updateCheckData,
    onDismissUpdate,
  } = props;

  const renderSurfaceFallback = (title: string) => (
    <section className="panel">
      <PanelHeader title={title} subtitle={messages.common.loading} />
      <div className="sub-toolbar">
        <div className="skeleton-line" />
      </div>
    </section>
  );

  return (
    <div className="app-shell">
      <main className="page page-shell-main">
        <TopShell {...topShellProps} />
        {showRuntimeBackendDegraded ? (
          <section className="degraded-banner" role="status" aria-live="polite">
            <strong>{messages.alerts.runtimeBackendDownTitle}</strong>
            <p>{messages.alerts.runtimeBackendDownBody}</p>
            <span>
              {messages.alerts.runtimeBackendDownHint} {runtimeBackend?.url ?? "ts-native"}
            </span>
          </section>
        ) : null}
        {showUpdateBanner && updateCheckData?.latest_version ? (
          <UpdateBanner
            messages={messages.alerts}
            currentVersion={updateCheckData.current_version}
            latestVersion={updateCheckData.latest_version}
            releaseUrl={updateCheckData.release_url}
            onDismiss={() => onDismissUpdate(updateCheckData.latest_version ?? "")}
          />
        ) : null}
        {layoutView === "overview" ? (
          <Suspense fallback={renderSurfaceFallback(messages.nav.overview)}>
            <OverviewWorkbench />
          </Suspense>
        ) : null}
        {showSearch ? (
          <Suspense fallback={renderSurfaceFallback(messages.nav.search)}>
            <SearchRoute />
          </Suspense>
        ) : null}
        {showProviders ? (
          <Suspense fallback={renderSurfaceFallback(messages.nav.providers)}>
            <ProvidersWorkspace />
          </Suspense>
        ) : null}
        {showThreadsTable ? (
          <Suspense fallback={renderSurfaceFallback(messages.nav.threads)}>
            <ThreadsWorkbench />
          </Suspense>
        ) : null}
        <DetailShell />
        <RuntimeFeedbackStack {...runtimeFeedbackProps} />
      </main>
    </div>
  );
}
