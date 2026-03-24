export interface ProviderSideStackProps {
  advancedOpen: boolean;
  sessionDetailSlot?: React.ReactNode;
  parserSlot?: React.ReactNode;
}

export function ProviderSideStack({
  advancedOpen,
  sessionDetailSlot,
  parserSlot,
}: ProviderSideStackProps) {
  return (
    <section className="provider-side-stack">
      {sessionDetailSlot}
      {advancedOpen ? parserSlot : null}
    </section>
  );
}
