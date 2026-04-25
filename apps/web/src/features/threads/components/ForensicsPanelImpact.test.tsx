import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "@/i18n/catalog";
import type { AnalyzeDeleteReport, ThreadRow } from "@/shared/types";
import { ForensicsPanel } from "@/features/threads/components/ForensicsPanel";

const messages = getMessages("en");

const rows: ThreadRow[] = [
  {
    thread_id: "thread-1",
    title: "Cleanup candidate",
    risk_score: 54,
    risk_level: "medium",
    risk_tags: ["internal", "ctx-high", "no-cwd"],
    is_pinned: false,
    source: "sessions",
    timestamp: "2026-03-27T00:00:00.000Z",
    activity_status: "stale",
    session_line_count: 5000,
    session_tool_calls: 1200,
    session_bytes: 9437184,
    session_format_ok: true,
    context_score: 80,
  },
];

const impactRows: AnalyzeDeleteReport[] = [
  {
    id: "thread-1",
    title: "Cleanup candidate",
    risk_level: "medium",
    risk_score: 54,
    summary: "Thread still has sidebar and local cache references.",
    parents: ["global-state:thread-titles", "workspace:/tmp/threadlens"],
    impacts: ["Removed from sidebar title metadata", "Local cache file will be removed"],
    cross_session_links: {
      strong_links: 1,
      mention_links: 1,
      related_threads: 2,
      strong_samples: [
        {
          thread_id: "thread-2",
          title: "Cross-thread QA",
          direction: "both",
          strength: "strong",
          evidence_kind: "parent_thread_id",
          matched_field: "payload.source.subagent.thread_spawn.parent_thread_id",
          matched_event: "session_meta",
          matched_value: "thread-1",
          matched_excerpt: '{"parent_thread_id":"thread-1"}',
        },
      ],
      mention_samples: [
        {
          thread_id: "thread-3",
          title: "Follow-up notes",
          direction: "outbound",
          strength: "mention",
          evidence_kind: "command_output",
          matched_field: "payload.command",
          matched_event: "exec_command_end",
          matched_value: 'rg "thread-3" .codex',
          matched_excerpt: 'rg "thread-3" .codex',
        },
      ],
      related_samples: [
        {
          thread_id: "thread-2",
          title: "Cross-thread QA",
          direction: "both",
          strength: "strong",
          evidence_kind: "parent_thread_id",
          matched_field: "payload.source.subagent.thread_spawn.parent_thread_id",
          matched_event: "session_meta",
          matched_value: "thread-1",
          matched_excerpt: '{"parent_thread_id":"thread-1"}',
        },
        {
          thread_id: "thread-3",
          title: "Follow-up notes",
          direction: "outbound",
          strength: "mention",
          evidence_kind: "command_output",
          matched_field: "payload.command",
          matched_event: "exec_command_end",
          matched_value: 'rg "thread-3" .codex',
          matched_excerpt: 'rg "thread-3" .codex',
        },
      ],
    },
    exists: true,
  },
];

describe("ForensicsPanel impact list", () => {
  it("renders unique detailed impact items instead of duplicated per-row summaries", () => {
    const duplicateImpactRows: AnalyzeDeleteReport[] = [
      {
        id: "thread-1",
        title: "Cleanup candidate",
        risk_level: "medium",
        risk_score: 54,
        summary: "Thread still has sidebar and local cache references.",
        parents: ["global-state:thread-titles", "global-state:thread-titles", "workspace:/tmp/threadlens"],
        impacts: ["Removed from sidebar title metadata", "Removed from sidebar title metadata"],
        exists: true,
      },
      {
        id: "thread-2",
        title: "Follow-up cleanup",
        risk_level: "low",
        risk_score: 10,
        summary: "Thread still has sidebar refs.",
        parents: ["global-state:thread-titles", "workspace:/tmp/threadlens"],
        impacts: ["Removed from sidebar title metadata", "Removed from the pinned list"],
        exists: true,
      },
    ];

    const html = renderToStaticMarkup(
      <ForensicsPanel
        messages={messages}
        threadActionsDisabled={false}
        selectedIds={["thread-1", "thread-2"]}
        selectedThreadId="thread-1"
        rows={rows}
        busy={false}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
        cleanupExecute={vi.fn()}
        cleanupData={null}
        pendingCleanup={null}
        selectedImpactRows={duplicateImpactRows}
        analysisRaw={null}
        cleanupRaw={null}
        analyzeDeleteError={false}
        cleanupDryRunError={false}
        cleanupExecuteError={false}
        analyzeDeleteErrorMessage=""
        cleanupDryRunErrorMessage=""
        cleanupExecuteErrorMessage=""
      />,
    );

    expect(html).toContain("Affected rows");
    expect(html.match(/global-state:thread-titles/g)).toHaveLength(1);
    expect(html.match(/workspace:\/tmp\/threadlens/g)).toHaveLength(1);
    expect(html.match(/Removed from sidebar title metadata/g)).toHaveLength(1);
    expect(html).toContain("Removed from the pinned list");
  });

  it("hides detailed impact rows when analysis has no concrete refs or changes", () => {
    const html = renderToStaticMarkup(
      <ForensicsPanel
        messages={messages}
        threadActionsDisabled={false}
        selectedIds={["thread-1"]}
        selectedThreadId="thread-1"
        rows={rows}
        busy={false}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
        cleanupExecute={vi.fn()}
        cleanupData={null}
        pendingCleanup={null}
        selectedImpactRows={[
          {
            id: "thread-1",
            title: "Cleanup candidate",
            risk_level: "low",
            risk_score: 1,
            summary: "Little to no impact",
            parents: [],
            impacts: [],
            exists: true,
          },
        ]}
        analysisRaw={null}
        cleanupRaw={null}
        analyzeDeleteError={false}
        cleanupDryRunError={false}
        cleanupExecuteError={false}
        analyzeDeleteErrorMessage=""
        cleanupDryRunErrorMessage=""
        cleanupExecuteErrorMessage=""
      />,
    );

    expect(html).not.toContain("Affected rows");
  });

  it("shows refs and changes for analyzed rows", () => {
    const html = renderToStaticMarkup(
      <ForensicsPanel
        messages={messages}
        threadActionsDisabled={false}
        selectedIds={["thread-1"]}
        selectedThreadId="thread-1"
        rows={rows}
        busy={false}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
        cleanupExecute={vi.fn()}
        cleanupData={null}
        pendingCleanup={null}
        selectedImpactRows={impactRows}
        analysisRaw={null}
        cleanupRaw={null}
        analyzeDeleteError={false}
        cleanupDryRunError={false}
        cleanupExecuteError={false}
        analyzeDeleteErrorMessage=""
        cleanupDryRunErrorMessage=""
        cleanupExecuteErrorMessage=""
      />,
    );

    expect(html).toContain("Why this score");
    expect(html).toContain("Top drivers");
    expect(html).toContain("Internal session");
    expect(html).toContain("High context");
    expect(html).toContain("Workspace missing");
    expect(html).not.toContain("Signal score");
    expect(html).toContain("Scoring details");
    expect(html).toContain("Context basis");
    expect(html).toContain("Final score criteria");
    expect(html).not.toContain("Evidence-backed signals");
    expect(html).not.toContain("Product policy");
    expect(html).toContain("9.0 MB");
    expect(html).toContain("Format anomaly");
    expect(html).toContain("clear");
    expect(html).toContain("Context score");
    expect(html).toContain("80 · derived from file size and transcript density");
    expect(html).not.toContain("5000+ (cap)");
    expect(html).not.toContain("1200+ (cap)");
    expect(html).toContain("Context band");
    expect(html).toContain("High context (80)");
    expect(html).toContain("Internal session");
    expect(html).toContain("applied");
    expect(html).toContain("Stale");
    expect(html).toContain("not applied");
    expect(html).toContain("Workspace missing");
    expect(html).toContain("+14");
    expect(html).toContain("Local cleanup impact");
    expect(html).toContain("Local changes");
    expect(html).toContain("Local refs and storage only.");
    expect(html).toContain("State refs");
    expect(html).toContain("Local storage");
    expect(html).toContain("Project reach");
    expect(html).toContain("Cross-session links");
    expect(html).toContain("Referencing sessions");
    expect(html).toContain("Linked sessions found");
    expect(html).toContain("Direct links");
    expect(html).toContain("In logs");
    expect(html).toContain("Filter by link type.");
    expect(html).toContain("Affected rows");
    expect(html).not.toContain("Cross-thread QA");
    expect(html).not.toContain("payload.source.subagent.thread_spawn.parent_thread_id");
    expect(html).toContain("Refs");
    expect(html).toContain("global-state:thread-titles");
    expect(html).toContain("Changes");
    expect(html).toContain("Removed from sidebar title metadata");
    expect(html.indexOf("Affected rows")).toBeLessThan(html.indexOf("Refs"));
    expect(html).toContain("Cleanup candidate");
    expect(html).toContain("54 · Medium");
  });

  it("deduplicates cross-session summary counts across multiple selected reports", () => {
    const html = renderToStaticMarkup(
      <ForensicsPanel
        messages={messages}
        threadActionsDisabled={false}
        selectedIds={["thread-1", "thread-4"]}
        selectedThreadId="thread-1"
        rows={rows}
        busy={false}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
        cleanupExecute={vi.fn()}
        cleanupData={null}
        pendingCleanup={null}
        selectedImpactRows={[
          ...impactRows,
          {
            id: "thread-4",
            title: "Second row",
            risk_level: "low",
            risk_score: 1,
            summary: "Session logs are stored separately and remain unless cleaned up separately",
            parents: [],
            impacts: [],
            cross_session_links: {
              strong_links: 1,
              mention_links: 1,
              related_threads: 2,
              strong_samples: [
                {
                  thread_id: "thread-2",
                  title: "Cross-thread QA",
                  direction: "both",
                  strength: "strong",
                  evidence_kind: "parent_thread_id",
                  matched_field: "payload.source.subagent.thread_spawn.parent_thread_id",
                  matched_event: "session_meta",
                  matched_value: "thread-4",
                  matched_excerpt: '{"parent_thread_id":"thread-4"}',
                },
              ],
              mention_samples: [
                {
                  thread_id: "thread-3",
                  title: "Follow-up notes",
                  direction: "outbound",
                  strength: "mention",
                  evidence_kind: "command_output",
                  matched_field: "payload.command",
                  matched_event: "exec_command_end",
                  matched_value: 'rg "thread-3" .codex',
                  matched_excerpt: 'rg "thread-3" .codex',
                },
              ],
              related_samples: [
                {
                  thread_id: "thread-2",
                  title: "Cross-thread QA",
                  direction: "both",
                  strength: "strong",
                  evidence_kind: "parent_thread_id",
                  matched_field: "payload.source.subagent.thread_spawn.parent_thread_id",
                  matched_event: "session_meta",
                  matched_value: "thread-4",
                  matched_excerpt: '{"parent_thread_id":"thread-4"}',
                },
                {
                  thread_id: "thread-3",
                  title: "Follow-up notes",
                  direction: "outbound",
                  strength: "mention",
                  evidence_kind: "command_output",
                  matched_field: "payload.command",
                  matched_event: "exec_command_end",
                  matched_value: 'rg "thread-3" .codex',
                  matched_excerpt: 'rg "thread-3" .codex',
                },
              ],
            },
            exists: true,
          },
        ]}
        analysisRaw={null}
        cleanupRaw={null}
        analyzeDeleteError={false}
        cleanupDryRunError={false}
        cleanupExecuteError={false}
        analyzeDeleteErrorMessage=""
        cleanupDryRunErrorMessage=""
        cleanupExecuteErrorMessage=""
      />,
    );

    expect(html).toContain("Linked sessions found");
    expect(html).toContain(">2</strong><p>Direct links 1 · In logs 1</p>");
  });

  it("renders direct and mention examples as readable evidence cards", () => {
    const html = renderToStaticMarkup(
      <ForensicsPanel
        messages={messages}
        threadActionsDisabled={false}
        selectedIds={["thread-1"]}
        selectedThreadId="thread-1"
        rows={rows}
        busy={false}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
        cleanupExecute={vi.fn()}
        cleanupData={null}
        pendingCleanup={null}
        selectedImpactRows={impactRows}
        analysisRaw={null}
        cleanupRaw={null}
        analyzeDeleteError={false}
        cleanupDryRunError={false}
        cleanupExecuteError={false}
        analyzeDeleteErrorMessage=""
        cleanupDryRunErrorMessage=""
        cleanupExecuteErrorMessage=""
        initialCrossSessionView="strong"
      />,
    );

    expect(html).toContain("Reference details");
    expect(html).toContain("This session metadata records the current thread as its parent.");
    expect(html).toContain("Matched snippet");
    expect(html).toContain("{&quot;parent_thread_id&quot;:&quot;thread-1&quot;}");
    expect(html).toContain("Event type");
    expect(html).toContain("session_meta");
    expect(html).toContain("Log field");
    expect(html).toContain("payload.source.subagent.thread_spawn.parent_thread_id");
  });
});
