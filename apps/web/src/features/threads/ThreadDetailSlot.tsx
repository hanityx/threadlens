import { lazy, Suspense } from "react";
import { PanelHeader } from "../../design-system/PanelHeader";
import type { ThreadDetailProps } from "./ThreadDetail";
import type { ForensicsPanelProps } from "./ForensicsPanel";

const ThreadDetail = lazy(async () => {
  const mod = await import("./ThreadDetail");
  return { default: mod.ThreadDetail };
});

const ForensicsPanel = lazy(async () => {
  const mod = await import("./ForensicsPanel");
  return { default: mod.ForensicsPanel };
});

export type ThreadDetailSlotProps = ThreadDetailProps & ForensicsPanelProps;

export function ThreadDetailSlot(props: ThreadDetailSlotProps) {
  return (
    <div className="thread-side-stack">
      <Suspense
        fallback={
          <section className="panel thread-review-panel">
            <PanelHeader title={props.messages.threadDetail.title} subtitle={props.messages.common.loading} />
          </section>
        }
      >
        <ThreadDetail {...props} />
      </Suspense>
      <Suspense
        fallback={
          <section className="panel thread-review-panel">
            <PanelHeader title={props.messages.nav.forensics} subtitle={props.messages.common.loading} />
          </section>
        }
      >
        <ForensicsPanel {...props} />
      </Suspense>
    </div>
  );
}
