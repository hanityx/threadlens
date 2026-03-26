import { lazy, Suspense } from "react";
import { PanelHeader } from "../../design-system/PanelHeader";
import type { ConversationSearchHit, ProviderView } from "../../types";
import { useAppContext } from "../../app/AppContext";

const SearchPanel = lazy(async () => {
  const mod = await import("./SearchPanel");
  return { default: mod.SearchPanel };
});

export function SearchRoute() {
  const {
    messages,
    searchProviderOptions,
    headerSearchSeed,
    visibleProviderIdSet,
    setSearchThreadContext,
    setSelectedThreadId,
    setSelectedSessionPath,
    changeLayoutView,
    changeProviderView,
  } = useAppContext();

  return (
    <Suspense
      fallback={
        <section className="panel">
          <PanelHeader title={messages.nav.search} subtitle={messages.common.loading} />
          <div className="sub-toolbar">
            <div className="skeleton-line" />
          </div>
        </section>
      }
    >
      <SearchPanel
        messages={messages}
        providerOptions={searchProviderOptions}
        initialQuery={headerSearchSeed}
        onOpenSession={(hit: ConversationSearchHit) => {
          if (visibleProviderIdSet.has(hit.provider)) {
            changeProviderView(hit.provider as ProviderView);
          } else {
            changeProviderView("all");
          }
          setSearchThreadContext(null);
          setSelectedThreadId("");
          setSelectedSessionPath(hit.file_path);
          changeLayoutView("providers");
        }}
        onOpenThread={(hit: ConversationSearchHit) => {
          if (!hit.thread_id) return;
          setSearchThreadContext(hit);
          setSelectedSessionPath("");
          setSelectedThreadId(hit.thread_id);
          changeLayoutView("threads");
        }}
      />
    </Suspense>
  );
}
