export function SessionHero(props: {
  sessionDisplayTitle: string;
  sessionCompactMeta: string;
  provider: string;
  sourceLabel: string;
  sessionFileName: string;
}) {
  const {
    sessionDisplayTitle,
    sessionCompactMeta,
    provider,
    sourceLabel,
    sessionFileName,
  } = props;

  return (
    <section className="detail-hero detail-hero-session detail-hero-session-compact">
      <div className="detail-hero-copy">
        <strong>{sessionDisplayTitle}</strong>
        <p>{sessionCompactMeta}</p>
      </div>
      <div className="detail-hero-pills" aria-label="session detail summary">
        <span className="detail-hero-pill">{provider}</span>
        {sourceLabel ? <span className="detail-hero-pill">{sourceLabel}</span> : null}
        {sessionFileName ? (
          <span className="detail-hero-pill detail-hero-pill-value" title={sessionFileName}>
            {sessionFileName}
          </span>
        ) : null}
      </div>
    </section>
  );
}
