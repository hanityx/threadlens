import { lazy, Suspense } from "react";
import { SurfaceSlotSkeleton } from "@/app/components/SurfaceSlotSkeleton";
import type { ThreadDetailProps } from "@/features/threads/components/ThreadDetail";

const ThreadDetail = lazy(async () => {
  const mod = await import("./ThreadDetail");
  return { default: mod.ThreadDetail };
});

export type ThreadDetailSlotProps = ThreadDetailProps;

export function ThreadDetailSlot(props: ThreadDetailSlotProps) {
  return <Suspense fallback={<SurfaceSlotSkeleton />}><ThreadDetail {...props} /></Suspense>;
}
