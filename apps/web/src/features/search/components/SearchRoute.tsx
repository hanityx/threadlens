import { SEARCHABLE_PROVIDER_IDS } from "@threadlens/shared-contracts";
import type { ConversationSearchHit, ProviderView } from "@/shared/types";
import { useAppContext } from "@/app/AppContext";
import { SearchPanel } from "@/features/search/components/SearchPanel";

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
  );
}
