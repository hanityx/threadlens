import type { Ref } from "react";

export interface ProviderSideStackProps {
  advancedOpen: boolean;
  sessionDetailSlot?: React.ReactNode;
  backupHubSlot?: React.ReactNode;
  parserSlot?: React.ReactNode;
  sectionRef?: Ref<HTMLElement>;
}

export function ProviderSideStack({
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
        <details className="detail-section">
          <summary>
            <strong>Backup &amp; export</strong>
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
