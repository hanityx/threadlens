import { TranscriptLog } from "@/shared/ui/components/TranscriptLog";
import type { Messages } from "@/i18n";
import type { TranscriptPayload } from "@/shared/types";

export function SessionTranscriptPane(props: {
  messages: Messages;
  sessionTranscriptData: TranscriptPayload | null;
  sessionTranscriptLoading: boolean;
  sessionTranscriptLimit: number;
  emptyTranscriptLabel: string;
  setSessionTranscriptLimit: React.Dispatch<React.SetStateAction<number>>;
}) {
  const {
    messages,
    sessionTranscriptData,
    sessionTranscriptLoading,
    sessionTranscriptLimit,
    emptyTranscriptLabel,
    setSessionTranscriptLimit,
  } = props;

  return (
    <details className="detail-section detail-section-transcript" open>
      <summary>{messages.sessionDetail.sectionTranscript}</summary>
      <div className="detail-section-body">
        <TranscriptLog
          messages={messages}
          transcript={sessionTranscriptData?.messages ?? []}
          loading={sessionTranscriptLoading}
          truncated={sessionTranscriptData?.truncated ?? false}
          messageCount={sessionTranscriptData?.message_count ?? 0}
          limit={sessionTranscriptLimit}
          initialVisibleCount={16}
          visibleStep={16}
          maxLimit={10_000}
          emptyLabel={emptyTranscriptLabel}
          onLoadMore={() => setSessionTranscriptLimit((prev) => Math.min(prev + 120, 10_000))}
          onLoadFullSource={() => setSessionTranscriptLimit(10_000)}
        />
      </div>
    </details>
  );
}
