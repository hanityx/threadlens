type UpdateBannerMessages = {
  updateAvailableTitle: string;
  updateAvailableBody: string;
  updateAvailableCurrentLabel: string;
  updateAvailableOpen: string;
  updateAvailableDismiss: string;
};

export function UpdateBanner(props: {
  messages: UpdateBannerMessages;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  onDismiss: () => void;
}) {
  const { messages, currentVersion, latestVersion, releaseUrl, onDismiss } = props;

  return (
    <section className="degraded-banner update-banner" role="status" aria-live="polite">
      <strong>{messages.updateAvailableTitle}</strong>
      <p>
        {messages.updateAvailableBody} <strong>v{latestVersion}</strong> · {messages.updateAvailableCurrentLabel} v{currentVersion}
      </p>
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
