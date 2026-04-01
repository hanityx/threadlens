type UpdateBannerMessages = {
  updateAvailableTitle: string;
  updateAvailableBody: string;
  updateAvailableOpen: string;
  updateAvailableDismiss: string;
};

export function UpdateBanner(props: {
  messages: UpdateBannerMessages;
  currentVersion: string;
  latestVersion: string;
  releaseSummary?: string | null;
  releaseUrl: string;
  onDismiss: () => void;
}) {
  const { messages, currentVersion, latestVersion, releaseSummary, releaseUrl, onDismiss } = props;

  return (
    <section className="degraded-banner update-banner" role="status" aria-live="polite">
      <strong>{messages.updateAvailableTitle}</strong>
      <p>
        {messages.updateAvailableBody} <strong>v{latestVersion}</strong> · current v{currentVersion}
      </p>
      {releaseSummary ? <p>{releaseSummary}</p> : null}
      <div className="update-banner-actions">
        <a href={releaseUrl} target="_blank" rel="noreferrer">
          {messages.updateAvailableOpen}
        </a>
        <button type="button" onClick={onDismiss}>
          {messages.updateAvailableDismiss}
        </button>
      </div>
    </section>
  );
}
