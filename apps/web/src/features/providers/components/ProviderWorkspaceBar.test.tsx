import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getMessages, type Messages } from "@/i18n";
import { ProviderWorkspaceBar } from "@/features/providers/components/ProviderWorkspaceBar";

const messages = getMessages("en");

const baseSummary = {
  sessions: 12,
  sources: 3,
  transcriptReady: 10,
  parseFail: 0,
  archived: 0,
  lastRefreshAt: "2026-03-27T08:00:00.000Z",
};

describe("ProviderWorkspaceBar", () => {
  it("renders provider chips and summary metrics", () => {
    const html = renderToStaticMarkup(
      <ProviderWorkspaceBar
        messages={messages}
        providerLabel="Codex"
        providerView="codex"
        coreProviderTabs={[{ id: "codex", name: "Codex" }]}
        optionalProviderTabs={[{ id: "claude", name: "Claude CLI" }]}
        onSelectProviderView={() => undefined}
        summary={baseSummary}
      />,
    );

    expect(html).toContain("Codex");
    expect(html).toContain("Sessions");
    expect(html).toContain("Transcript");
    expect(html).toContain('class="provider-workspace-title"');
  });

  it("renders parse-fail warning when parseFail > 0", () => {
    const html = renderToStaticMarkup(
      <ProviderWorkspaceBar
        messages={messages}
        providerLabel="All Providers"
        providerView="all"
        coreProviderTabs={[]}
        optionalProviderTabs={[]}
        onSelectProviderView={() => undefined}
        summary={{ ...baseSummary, parseFail: 3 }}
      />,
    );

    expect(html).toContain("Parse fail");
    expect(html).toContain("Open transcripts, back up selected sessions, and dry-run file actions only when needed.");
    expect(html).toContain('class="provider-workspace-title"');
  });

  it("renders archived count when > 0", () => {
    const html = renderToStaticMarkup(
      <ProviderWorkspaceBar
        messages={messages}
        providerLabel="All Providers"
        providerView="all"
        coreProviderTabs={[]}
        optionalProviderTabs={[]}
        onSelectProviderView={() => undefined}
        summary={{ ...baseSummary, archived: 5 }}
      />,
    );

    expect(html).toContain("Archived");
  });

  it("renders localized sync age when refresh time is present", () => {
    const realNow = Date.now;
    Date.now = () => new Date("2026-03-27T10:00:00.000Z").getTime();
    try {
      const html = renderToStaticMarkup(
        <ProviderWorkspaceBar
          messages={messages}
          providerLabel="All Providers"
          providerView="all"
          coreProviderTabs={[]}
          optionalProviderTabs={[]}
          onSelectProviderView={() => undefined}
          summary={baseSummary}
        />,
      );

      expect(html).toContain("Synced");
      expect(html).toContain("2h ago");
    } finally {
      Date.now = realNow;
    }
  });

  it("renders Korean workspace copy for the sessions hub", () => {
    const koMessages = getMessages("ko");
    const html = renderToStaticMarkup(
      <ProviderWorkspaceBar
        messages={koMessages}
        providerLabel="모든 프로바이더"
        providerView="all"
        coreProviderTabs={[]}
        optionalProviderTabs={[]}
        onSelectProviderView={() => undefined}
        summary={{ ...baseSummary, parseFail: 2 }}
      />,
    );

    expect(html).toContain("모든 프로바이더");
    expect(html).toContain("트랜스크립트를 열고, 선택한 세션을 백업하고, 필요할 때만 파일 작업을 미리 확인합니다.");
    expect(html).toContain("트랜스크립트 준비");
    expect(html).toContain("파싱 실패");
  });
});
