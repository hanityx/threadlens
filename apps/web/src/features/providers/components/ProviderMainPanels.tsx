import type { ComponentProps, ReactNode } from "react";
import { BackupHub } from "@/features/providers/components/BackupHub";
import { ProviderSideStack } from "@/features/providers/components/ProviderSideStack";
import { SessionTable } from "@/features/providers/components/SessionTable";
import { ParserHealthTable } from "@/features/providers/parser/ParserHealthTable";

export function ProviderMainPanels(props: {
  selectedSessionPath: string;
  activeSessionPanelHeight: number | null;
  sessionTableProps: ComponentProps<typeof SessionTable>;
  sideStackProps: Omit<ComponentProps<typeof ProviderSideStack>, "backupHubSlot" | "parserSlot">;
  backupHubProps: ComponentProps<typeof BackupHub>;
  parserTableProps: ComponentProps<typeof ParserHealthTable>;
  sessionDetailSlot?: ReactNode;
}) {
  const {
    selectedSessionPath,
    activeSessionPanelHeight,
    sessionTableProps,
    sideStackProps,
    backupHubProps,
    parserTableProps,
    sessionDetailSlot,
  } = props;

  return (
    <section className={`provider-ops-layout ${selectedSessionPath ? "is-session-active" : ""}`.trim()}>
      <SessionTable
        {...sessionTableProps}
        panelStyle={activeSessionPanelHeight ? { height: `${activeSessionPanelHeight}px` } : undefined}
      />
      <ProviderSideStack
        {...sideStackProps}
        sessionDetailSlot={sessionDetailSlot}
        backupHubSlot={<BackupHub {...backupHubProps} />}
        parserSlot={<ParserHealthTable {...parserTableProps} />}
      />
    </section>
  );
}
