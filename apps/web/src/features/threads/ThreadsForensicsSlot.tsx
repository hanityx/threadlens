import { lazy, Suspense } from "react";
import type { ForensicsPanelProps } from "./ForensicsPanel";
import type { Messages } from "../../i18n";

const ForensicsPanel = lazy(async () => {
  const mod = await import("./ForensicsPanel");
  return { default: mod.ForensicsPanel };
});

type ThreadsForensicsSlotProps = ForensicsPanelProps & {
  messages: Messages;
};

export function ThreadsForensicsSlot(props: ThreadsForensicsSlotProps) {
  return (
    <Suspense
      fallback={
        <section className="panel">
          <header>
            <h2>{props.messages.nav.forensics}</h2>
            <span>{props.messages.common.loading}</span>
          </header>
          <div className="sub-toolbar">
            <div className="skeleton-line" />
          </div>
        </section>
      }
    >
      <ForensicsPanel {...props} />
    </Suspense>
  );
}
