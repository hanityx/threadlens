import type { Messages } from "@/i18n";
import type { Ref } from "react";

export interface ProviderSideStackProps {
  messages: Messages;
  advancedOpen: boolean;
  sessionDetailSlot?: React.ReactNode;
  backupHubSlot?: React.ReactNode;
  parserSlot?: React.ReactNode;
  sectionRef?: Ref<HTMLElement>;
}

export function ProviderSideStack({
  messages,
  advancedOpen,
  sessionDetailSlot,
  backupHubSlot,
  parserSlot,
  sectionRef,
}: ProviderSideStackProps) {
  return (
    <section className="provider-side-stack" ref={sectionRef}>
      {sessionDetailSlot}
      {backupHubSlot ? (
        <details className="detail-section" data-testid="provider-backup-hub-section">
          <summary>
            <strong>{messages.providers.backupHubTitle}</strong>
          </summary>
          <div className="detail-section-body">
            {backupHubSlot}
          </div>
        </details>
      ) : null}
      {advancedOpen ? parserSlot : null}
    </section>
  );
}
