import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Messages } from "../../i18n";
import { ProviderWorkspaceBar } from "./ProviderWorkspaceBar";

const messages = {
  common: {
    allAi: "All AI",
  },
  providers: {
    hubTitle: "Provider hub",
    optionalProvidersSummary: "Optional providers",
    hubMetricSessions: "Sessions",
    hubMetricSources: "Sources",
    hubMetricTranscript: "Transcript",
    hubMetricParseFail: "Parse fail",
  },
} as unknown as Messages;

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
  });

  it("renders parse-fail warning when parseFail > 0", () => {
    const html = renderToStaticMarkup(
      <ProviderWorkspaceBar
        messages={messages}
        providerLabel="All providers"
        providerView="all"
        coreProviderTabs={[]}
        optionalProviderTabs={[]}
        onSelectProviderView={() => undefined}
        summary={{ ...baseSummary, parseFail: 3 }}
      />,
    );

    expect(html).toContain("Parse fail");
  });

  it("renders archived count when > 0", () => {
    const html = renderToStaticMarkup(
      <ProviderWorkspaceBar
        messages={messages}
        providerLabel="All providers"
        providerView="all"
        coreProviderTabs={[]}
        optionalProviderTabs={[]}
        onSelectProviderView={() => undefined}
        summary={{ ...baseSummary, archived: 5 }}
      />,
    );

    expect(html).toContain("archived");
  });
});
