import type { Ref } from "react";
import type { ThreadDetailProps } from "@/features/threads/components/ThreadDetail";
import type { ForensicsPanelProps } from "@/features/threads/components/ForensicsPanel";
import { ThreadDetailSlot } from "@/features/threads/components/ThreadDetailSlot";
import { ThreadsForensicsSlot } from "@/features/threads/components/ThreadsForensicsSlot";

type ThreadsSideStackProps = {
  showForensics: boolean;
  threadSideStackRef: Ref<HTMLDivElement>;
  activePanelHeight: number | null;
  detailProps: ThreadDetailProps;
  forensicsProps: ForensicsPanelProps;
};

export function ThreadsSideStack({
  showForensics,
  threadSideStackRef,
  activePanelHeight,
  detailProps,
  forensicsProps,
}: ThreadsSideStackProps) {
  if (!showForensics) return null;
  return (
    <div
      className="thread-side-stack"
      ref={threadSideStackRef}
      style={activePanelHeight ? { height: `${activePanelHeight}px` } : undefined}
    >
      <ThreadDetailSlot {...detailProps} />
      <ThreadsForensicsSlot {...forensicsProps} />
    </div>
  );
}
