import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ExecutionGraphData } from "@threadlens/shared-contracts";
import { getMessages } from "@/i18n/catalog";
import type { ProviderParserHealthReport, ProviderSessionRow } from "@/shared/types";
import { RoutingPanel } from "@/features/providers/routing/RoutingPanel";

const messages = getMessages("en");

const graphData: ExecutionGraphData = {
  generated_at: "2026-03-31T03:00:00.000Z",
  nodes: [],
  edges: [],
  findings: [],
  evidence: {
    codex_config_path: "/workspace/example/.codex/config.toml",
    global_state_path: "/workspace/example/.codex/state.json",
    trusted_projects: ["/workspace/threadlens"],
    providers: [
      {
        provider: "codex",
        name: "Codex",
        status: "active",
        capability_level: "full",
        session_log_count: 3,
        roots: ["/workspace/example/.codex/sessions"],
        notes: "thread/state",
        capabilities: {
          read_sessions: true,
          analyze_context: true,
          safe_cleanup: true,
          hard_delete: false,
        },
      },
    ],
    data_sources: [
      {
        source_key: "sessions",
        path: "/workspace/example/.codex/sessions",
        present: true,
        file_count: 3,
        dir_count: 1,
        total_bytes: 1024,
        latest_mtime: "2026-03-31T02:00:00.000Z",
      },
    ],
  },
};

const providerSessionRows: ProviderSessionRow[] = [
  {
    provider: "codex",
    source: "sessions",
    session_id: "thread-001",
    display_title: "Cleanup run",
    file_path: "/workspace/example/.codex/sessions/thread-001.jsonl",
    size_bytes: 1024,
    mtime: "2026-03-31T02:00:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: "Cleanup run",
      title_source: "message",
    },
  },
];

const parserReports: ProviderParserHealthReport[] = [
  {
    provider: "codex",
    name: "Codex",
    status: "active",
    scanned: 3,
    parse_ok: 3,
    parse_fail: 0,
    parse_score: 100,
    truncated: false,
  },
];

describe("RoutingPanel", () => {
  it("renders simplified workbench notes for each provider", () => {
    const html = renderToStaticMarkup(
      <RoutingPanel
        messages={messages}
        data={{
          ...graphData,
          evidence: {
            ...graphData.evidence,
            providers: [
              graphData.evidence.providers[0],
              {
                provider: "claude",
                name: "Claude",
                status: "active",
                capability_level: "full",
                session_log_count: 2,
                roots: ["/workspace/example/.claude/projects"],
                notes: "Session and transcript files.",
                capabilities: {
                  read_sessions: true,
                  analyze_context: true,
                  safe_cleanup: true,
                  hard_delete: false,
                },
              },
              {
                provider: "gemini",
                name: "Gemini",
                status: "active",
                capability_level: "full",
                session_log_count: 2,
                roots: ["/workspace/example/.gemini/history"],
                notes: "History, tmp, and checkpoint files.",
                capabilities: {
                  read_sessions: true,
                  analyze_context: true,
                  safe_cleanup: true,
                  hard_delete: false,
                },
              },
              {
                provider: "copilot",
                name: "Copilot",
                status: "active",
                capability_level: "full",
                session_log_count: 2,
                roots: ["/workspace/example/.vscode/workspaceStorage"],
                notes: "Workspace chat files and editor traces.",
                capabilities: {
                  read_sessions: true,
                  analyze_context: true,
                  safe_cleanup: true,
                  hard_delete: false,
                },
              },
            ],
          },
        }}
        loading={false}
        providerView="all"
        onSelectProviderView={() => undefined}
        providerSessionRows={providerSessionRows}
        parserReports={parserReports}
        visibleProviderIds={["codex", "claude", "gemini", "copilot"]}
      />,
    );

    expect(html).toContain("threads / state");
    expect(html).toContain("sessions / transcripts");
    expect(html).toContain("history / checkpoints");
    expect(html).toContain("workspace chats / traces");
  });

  it("renders clickable provider cards in all-provider diagnostics view", () => {
    const html = renderToStaticMarkup(
      <RoutingPanel
        messages={messages}
        data={graphData}
        loading={false}
        providerView="all"
        onSelectProviderView={() => undefined}
        providerSessionRows={providerSessionRows}
        parserReports={parserReports}
        visibleProviderIds={["codex", "claude", "gemini"]}
      />,
    );

    expect(html).toContain("is-clickable");
    expect(html).toContain(">Codex<");
    expect(html).not.toContain(">pick one<");
    expect(html).not.toContain(messages.routing.returnToAllProviders);
    expect(html).not.toContain(messages.routing.storageMapEyebrow);
    expect(html).not.toContain(messages.routing.findingsEyebrow);
    expect(html).not.toContain(messages.routing.executionPathEyebrow);
    expect(html).not.toContain(messages.routing.transitionsEyebrow);
    expect(html).not.toContain(`<h3>${messages.routing.pathsTitle}</h3>`);
    expect(html).not.toContain(`<h3>${messages.routing.findingsListTitle}</h3>`);
    expect(html).not.toContain(`<h3>${messages.routing.flowTitle}</h3>`);
    expect(html).not.toContain(`<h3>${messages.routing.flowEdges}</h3>`);
  });

  it("renders an explicit return action when a provider is focused", () => {
    const html = renderToStaticMarkup(
      <RoutingPanel
        messages={messages}
        data={graphData}
        loading={false}
        providerView="codex"
        onSelectProviderView={() => undefined}
        providerSessionRows={providerSessionRows}
        parserReports={parserReports}
        visibleProviderIds={["codex"]}
      />,
    );

    expect(html).toContain(messages.routing.returnToAllProviders);
    expect(html).toContain("routing-provider-scope-return");
  });

  it("renders localized diagnostics stage copy for a focused provider", () => {
    const ruMessages = getMessages("ru");
    const html = renderToStaticMarkup(
      <RoutingPanel
        messages={ruMessages}
        data={graphData}
        loading={false}
        providerView="codex"
        onSelectProviderView={() => undefined}
        providerSessionRows={providerSessionRows}
        parserReports={parserReports}
        visibleProviderIds={["codex"]}
      />,
    );

    expect(html).toContain(ruMessages.routing.stageTitle);
    expect(html).toContain(ruMessages.routing.stageEyebrow);
    expect(html).toContain(ruMessages.routing.providersTitle);
    expect(html).toContain(ruMessages.routing.stageSummaryProvidersLabel);
    expect(html).toContain(ruMessages.routing.stageSummaryPathsLabel);
    expect(html).toContain(ruMessages.routing.stageSummaryFlowLabel);
    expect(html).toContain(ruMessages.routing.stageSummaryFindingsLabel);
    expect(html).toContain(ruMessages.routing.storageMapTitle);
    expect(html).toContain(ruMessages.routing.flowDetailLogsReady.replace("{count}", "1"));
    expect(html).toContain(ruMessages.routing.flowDetailCleanupReady);
    expect(html).toContain(ruMessages.routing.profileTitle);
    expect(html).toContain(ruMessages.routing.profileSessionModel);
    expect(html).toContain(ruMessages.routing.profileResumeModel);
    expect(html).toContain(ruMessages.routing.profileCleanupModel);
    expect(html).toContain(ruMessages.routing.profilePrimarySurface);
    expect(html).toContain(ruMessages.routing.findingsTitle);
    expect(html).toContain(ruMessages.routing.executionPathTitle);
    expect(html).toContain(ruMessages.routing.detailSessionLogsLabel);
    expect(html).toContain("threads / state");
    expect(html).toContain(ruMessages.routing.providerSpecificFlow);
    expect(html).toContain(ruMessages.routing.sourceBreakdownTitle);
    expect(html).toContain(ruMessages.routing.formatBreakdownTitle);
    expect(html).toContain(ruMessages.routing.config);
    expect(html).toContain(ruMessages.routing.detailSessionLogsLabel);
    expect(html).toContain(ruMessages.routing.pathsTitle);
    expect(html).toContain(ruMessages.routing.flowDetailParserOk.replace("{ok}", "3").replace("{scanned}", "3"));
    expect(html).toContain(`Codex ${ruMessages.routing.globalState}`);
    expect(html).not.toContain(ruMessages.routing.storageMapEyebrow);
    expect(html).not.toContain(ruMessages.routing.findingsEyebrow);
    expect(html).not.toContain(ruMessages.routing.executionPathEyebrow);
    expect(html).not.toContain(ruMessages.routing.transitionsEyebrow);
    expect(html).not.toContain(`<h3>${ruMessages.routing.findingsListTitle}</h3>`);
    expect(html).not.toContain(`<h3>${ruMessages.routing.flowTitle}</h3>`);
    expect(html).not.toContain(`<h3>${ruMessages.routing.flowEdges}</h3>`);
  });
});
