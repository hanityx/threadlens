import { lazy, Suspense } from "react";
import type { SearchPanelProps } from "../components/SearchPanel";
import type { Messages } from "../i18n";

const SearchPanel = lazy(async () => {
  const mod = await import("../components/SearchPanel");
  return { default: mod.SearchPanel };
});

type SearchRouteProps = SearchPanelProps & {
  messages: Messages;
};

export function SearchRoute(props: SearchRouteProps) {
  return (
    <Suspense
      fallback={
        <section className="panel">
          <header>
            <h2>{props.messages.nav.search}</h2>
            <span>{props.messages.common.loading}</span>
          </header>
          <div className="sub-toolbar">
            <div className="skeleton-line" />
          </div>
        </section>
      }
    >
      <SearchPanel {...props} />
    </Suspense>
  );
}
