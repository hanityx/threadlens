import type { UpdateCheckStatus } from "@threadlens/shared-contracts";
import { useAppContext } from "@/app/AppContext";
import { DetailShell } from "@/app/components/DetailShell";
import { RuntimeFeedbackStack } from "@/app/components/RuntimeFeedbackStack";
import { TopShell } from "@/app/components/TopShell";
import { UpdateBanner } from "@/app/components/UpdateBanner";
import { OverviewWorkbench } from "@/features/overview/components/OverviewWorkbench";
import { ProvidersWorkspace } from "@/features/providers/components/ProvidersWorkspace";
import { SearchRoute } from "@/features/search/components/SearchRoute";
import { ThreadsWorkbench } from "@/features/threads/components/ThreadsWorkbench";

type RuntimeBackend = {
  reachable?: boolean;
  latency_ms?: number | null;
  url?: string;
};

export function AppShell(props: {
  showRuntimeBackendDegraded: boolean;
  runtimeBackend?: RuntimeBackend;
  showUpdateBanner: boolean;
  updateCheckData: UpdateCheckStatus | null;
  onDismissUpdate: (version: string) => void;
}) {
  const { showRuntimeBackendDegraded, runtimeBackend, showUpdateBanner, updateCheckData, onDismissUpdate } = props;
  const { messages, layoutView, showSearch, showProviders, showThreadsTable } = useAppContext();

  return (
    <div className="app-shell">
      <main className="page page-shell-main">
        <TopShell />
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
        {layoutView === "overview" ? <OverviewWorkbench /> : null}
        {showSearch ? <SearchRoute /> : null}
        {showProviders ? <ProvidersWorkspace /> : null}
        {showThreadsTable ? <ThreadsWorkbench /> : null}
        <DetailShell />
        <RuntimeFeedbackStack />
      </main>
    </div>
  );
}
