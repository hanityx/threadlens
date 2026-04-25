import { useEffect } from "react";
import { SEARCHABLE_PROVIDER_IDS } from "@threadlens/shared-contracts";
import type { ConversationSearchHit, ProviderView } from "@/shared/types";
import { useAppContext } from "@/app/AppContext";
import { buildDesktopRouteSearch } from "@/app/model/appShellBehavior";
import "@/features/search/search.css";
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
    setLayoutView,
    setProviderView,
  } = useAppContext();

  useEffect(() => {
    if (!headerSearchSeed.trim()) return;
    setHeaderSearchSeed("");
  }, [headerSearchSeed, setHeaderSearchSeed]);

  return (
    <SearchPanel
      messages={messages}
      providerOptions={searchProviderOptions}
      sessionOpenProviderIds={SESSION_OPENABLE_SEARCH_PROVIDER_IDS}
      initialQuery={headerSearchSeed}
      onOpenSession={(hit: ConversationSearchHit) => {
        if (typeof window !== "undefined") {
          const nextSearch = buildDesktopRouteSearch(window.location.search, {
            view: "providers",
            provider: ((hit.provider as ProviderView) || "all"),
            sessionId: hit.session_id ?? "",
            filePath: hit.file_path ?? "",
            threadId: "",
          });
          const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
          window.history.pushState(null, "", nextUrl);
        }
        setProviderView((hit.provider as ProviderView) || "all");
        setSearchThreadContext(null);
        setSelectedThreadId("");
        setSelectedSessionPath(hit.file_path);
        setLayoutView("providers");
      }}
      onOpenThread={(hit: ConversationSearchHit) => {
        if (!hit.thread_id) return;
        setSearchThreadContext(hit);
        setSelectedSessionPath("");
        setSelectedThreadId(hit.thread_id);
        setLayoutView("threads");
      }}
    />
  );
}
