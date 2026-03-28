import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "../i18n";
import { TranscriptLog } from "./TranscriptLog";

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
        onLoadMore={vi.fn()}
      />,
    );

    expect(html).toContain("24 messages");
    expect(html).toContain("Tail window");
    expect(html).toContain("Loaded");
    expect(html).toContain("Matching");
    expect(html).not.toContain("Showing");
    expect(html).not.toContain("Filtered");
  });
});
