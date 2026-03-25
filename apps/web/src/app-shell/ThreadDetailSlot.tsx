import { lazy, Suspense } from "react";
import type { ThreadDetailProps } from "../components/ThreadDetail";

const ThreadDetail = lazy(async () => {
  const mod = await import("../components/ThreadDetail");
  return { default: mod.ThreadDetail };
});

export function ThreadDetailSlot(props: ThreadDetailProps) {
  return (
    <Suspense
      fallback={
        <section className="panel thread-review-panel">
          <header>
            <h2>{props.messages.threadDetail.title}</h2>
            <span>{props.messages.common.loading}</span>
          </header>
        </section>
      }
    >
      <ThreadDetail {...props} />
    </Suspense>
  );
}
