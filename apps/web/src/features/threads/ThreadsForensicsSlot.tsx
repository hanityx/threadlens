import { lazy, Suspense } from "react";
import { PanelHeader } from "../../design-system/PanelHeader";
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
          <PanelHeader title={props.messages.nav.forensics} subtitle={props.messages.common.loading} />
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
