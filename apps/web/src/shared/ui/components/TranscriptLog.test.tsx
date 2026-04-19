import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "@/i18n";
import { TranscriptLog } from "@/shared/ui/components/TranscriptLog";

const messages = getMessages("en");

describe("TranscriptLog", () => {
  it("renders compact summary stats without duplicate showing or filtered copy", () => {
    const html = renderToStaticMarkup(
      <TranscriptLog
        messages={messages}
        transcript={[
          {
            idx: 1,
            role: "user",
            text: "hello",
            ts: "2026-03-28T00:00:00.000Z",
            source_type: "jsonl",
          },
          {
            idx: 2,
            role: "assistant",
            text: "world",
            ts: "2026-03-28T00:00:01.000Z",
            source_type: "jsonl",
          },
        ]}
        loading={false}
        truncated={true}
        messageCount={24}
        limit={120}
        maxLimit={10_000}
        onLoadMore={vi.fn()}
        onLoadFullSource={vi.fn()}
      />,
    );

    expect(html).toContain("24 messages");
    expect(html).toContain("Tail");
    expect(html).toContain("Loaded");
    expect(html).toContain("Matching");
    expect(html).toContain("Load max source window");
    expect(html).toContain("Newest first");
    expect(html).not.toContain("Showing");
    expect(html).not.toContain("Filtered");
    expect(html).not.toContain("Start with just user and assistant turns.");
    expect(html).not.toContain("Default is user and assistant only.");
  });

  it("renders a transcript focus-view trigger and modal shell when opened", () => {
    const html = renderToStaticMarkup(
      <TranscriptLog
        messages={messages}
        transcript={[
          {
            idx: 1,
            role: "user",
            text: "hello",
            ts: "2026-03-28T00:00:00.000Z",
            source_type: "jsonl",
          },
        ]}
        loading={false}
        truncated={false}
        messageCount={1}
        limit={120}
        maxLimit={10_000}
        initialFocusViewOpen={true}
        onLoadMore={vi.fn()}
      />,
    );

    expect(html).toContain("Open transcript focus view");
    expect(html).toContain("transcript-focus-modal");
    expect(html).toContain("Close transcript focus view");
  });
});
