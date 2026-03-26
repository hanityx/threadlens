export interface ProviderSideStackProps {
  advancedOpen: boolean;
  sessionDetailSlot?: React.ReactNode;
  backupHubSlot?: React.ReactNode;
  parserSlot?: React.ReactNode;
}

export function ProviderSideStack({
  advancedOpen,
  sessionDetailSlot,
  backupHubSlot,
  parserSlot,
}: ProviderSideStackProps) {
  return (
    <section className="provider-side-stack">
      {sessionDetailSlot}
      {backupHubSlot ? (
        <details className="detail-section">
          <summary>
            <span className="overview-note-label">backup</span>
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
