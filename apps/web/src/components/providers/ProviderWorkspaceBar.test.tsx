import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Messages } from "../../i18n";
import type { ProviderSessionRow } from "../../types";
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

const recentRows: ProviderSessionRow[] = [
  {
    provider: "codex",
    source: "history",
    session_id: "session-1234567890",
    display_title: "Codex cleanup run",
    file_path: "/tmp/codex-session.jsonl",
    size_bytes: 256,
    mtime: "2026-03-24T08:00:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: "Codex cleanup run",
      title_source: "header",
    },
  },
];

describe("ProviderWorkspaceBar", () => {
  it("renders provider chips, summary metrics, recent rows, and backup slot", () => {
    const onSelectProviderView = vi.fn();
    const onSelectRecentRow = vi.fn();

    const html = renderToStaticMarkup(
      <ProviderWorkspaceBar
        messages={messages}
        providerLabel="Codex"
        providerView="codex"
        coreProviderTabs={[{ id: "codex", name: "Codex" }]}
        optionalProviderTabs={[{ id: "claude", name: "Claude" }]}
        onSelectProviderView={onSelectProviderView}
        summary={{
          sessions: 12,
          sources: 3,
          transcriptReady: 10,
          parseFail: 2,
        }}
        providerWorkspaceRecentRows={recentRows}
        selectedSessionPath="/tmp/codex-session.jsonl"
        onSelectRecentRow={onSelectRecentRow}
        backupHubSlot={<div>Backup slot</div>}
      />,
    );

    expect(html).toContain("Provider hub");
    expect(html).toContain("Codex sessions");
    expect(html).toContain("Optional providers");
    expect(html).toContain("Sessions");
    expect(html).toContain("Transcript");
    expect(html).toContain("Codex cleanup run");
    expect(html).toContain("Backup slot");
    expect(onSelectProviderView).not.toHaveBeenCalled();
    expect(onSelectRecentRow).not.toHaveBeenCalled();
  });

  it("renders empty recent-row state without the list", () => {
    const html = renderToStaticMarkup(
      <ProviderWorkspaceBar
        messages={messages}
        providerLabel="All providers"
        providerView="all"
        coreProviderTabs={[]}
        optionalProviderTabs={[]}
        onSelectProviderView={() => undefined}
        summary={{
          sessions: 0,
          sources: 0,
          transcriptReady: 0,
          parseFail: 0,
        }}
        providerWorkspaceRecentRows={[]}
        selectedSessionPath={null}
        onSelectRecentRow={() => undefined}
        backupHubSlot={<div>Backup slot</div>}
      />,
    );

    expect(html).not.toContain("recent rows");
    expect(html).toContain("Backup slot");
  });
});
