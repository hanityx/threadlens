export function TabSurfaceSkeleton() {
  return (
    <section className="tab-surface-skeleton" aria-hidden="true">
      <div className="tab-surface-skeleton__hero">
        <div className="tab-surface-skeleton__pill tab-surface-skeleton__pill--wide" />
        <div className="tab-surface-skeleton__pill" />
        <div className="tab-surface-skeleton__pill tab-surface-skeleton__pill--muted" />
      </div>
      <div className="tab-surface-skeleton__grid">
        <div className="tab-surface-skeleton__card tab-surface-skeleton__card--main">
          <div className="tab-surface-skeleton__line tab-surface-skeleton__line--title" />
          <div className="tab-surface-skeleton__line tab-surface-skeleton__line--body" />
          <div className="tab-surface-skeleton__line tab-surface-skeleton__line--body" />
          <div className="tab-surface-skeleton__line tab-surface-skeleton__line--short" />
        </div>
        <div className="tab-surface-skeleton__stack">
          <div className="tab-surface-skeleton__card">
            <div className="tab-surface-skeleton__line tab-surface-skeleton__line--title" />
            <div className="tab-surface-skeleton__line tab-surface-skeleton__line--short" />
            <div className="tab-surface-skeleton__line tab-surface-skeleton__line--body" />
          </div>
          <div className="tab-surface-skeleton__card">
            <div className="tab-surface-skeleton__line tab-surface-skeleton__line--title" />
            <div className="tab-surface-skeleton__line tab-surface-skeleton__line--body" />
            <div className="tab-surface-skeleton__line tab-surface-skeleton__line--short" />
          </div>
        </div>
      </div>
    </section>
  );
}
