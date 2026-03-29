import { SEARCHABLE_PROVIDER_IDS } from "@threadlens/shared-contracts";
import { lazy, Suspense } from "react";
import { PanelHeader } from "../../design-system/PanelHeader";
import type { ConversationSearchHit, ProviderView } from "../../types";
import { useAppContext } from "../../app/AppContext";

const SearchPanel = lazy(async () => {
  const mod = await import("./SearchPanel");
  return { default: mod.SearchPanel };
});

const SESSION_OPENABLE_SEARCH_PROVIDER_IDS: ProviderView[] = [...SEARCHABLE_PROVIDER_IDS];

export function SearchRoute() {
  const {
    messages,
    searchProviderOptions,
    headerSearchSeed,
    setHeaderSearchSeed,
    setSearchThreadContext,
    setSelectedThreadId,
    setSelectedSessionPath,
    changeLayoutView,
    setProviderView,
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
        sessionOpenProviderIds={SESSION_OPENABLE_SEARCH_PROVIDER_IDS}
        initialQuery={headerSearchSeed}
        onQueryDraftChange={setHeaderSearchSeed}
        onOpenSession={(hit: ConversationSearchHit) => {
          setProviderView((hit.provider as ProviderView) || "all");
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
