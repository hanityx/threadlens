import { lazy, Suspense } from "react";
import { SurfaceSlotSkeleton } from "@/app/components/SurfaceSlotSkeleton";
import type { ForensicsPanelProps } from "@/features/threads/components/ForensicsPanel";
import type { Messages } from "@/i18n";

const ForensicsPanel = lazy(async () => {
  const mod = await import("./ForensicsPanel");
  return { default: mod.ForensicsPanel };
});

type ThreadsForensicsSlotProps = ForensicsPanelProps & {
  messages: Messages;
};

export function ThreadsForensicsSlot(props: ThreadsForensicsSlotProps) {
  return <Suspense fallback={<SurfaceSlotSkeleton />}><ForensicsPanel {...props} /></Suspense>;
}
