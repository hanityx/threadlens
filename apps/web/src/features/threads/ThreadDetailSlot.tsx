import { lazy, Suspense } from "react";
import { PanelHeader } from "../../design-system/PanelHeader";
import type { ThreadDetailProps } from "./ThreadDetail";

const ThreadDetail = lazy(async () => {
  const mod = await import("./ThreadDetail");
  return { default: mod.ThreadDetail };
});

export function ThreadDetailSlot(props: ThreadDetailProps) {
  return (
    <Suspense
      fallback={
        <section className="panel thread-review-panel">
          <PanelHeader title={props.messages.threadDetail.title} subtitle={props.messages.common.loading} />
        </section>
      }
    >
      <ThreadDetail {...props} />
    </Suspense>
  );
}
