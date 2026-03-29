import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "../../i18n";
import type { ProviderSessionActionResult, ProviderSessionRow } from "../../types";
import { SessionDetail } from "./SessionDetail";

const messages = getMessages("en");

const selectedSession: ProviderSessionRow = {
  provider: "codex",
  source: "history",
  session_id: "session-1234567890abcdef",
  display_title: "Selected Codex session",
  file_path: "/tmp/rollout-2026-03-29T03-15-34-session-notes.jsonl",
  size_bytes: 128,
  mtime: "2026-03-24T00:00:00.000Z",
  probe: {
    ok: true,
    format: "jsonl",
    error: null,
    detected_title: "Selected Codex session",
    title_source: "header",
  },
};

const sessionActionResult: ProviderSessionActionResult = {
  ok: true,
  provider: "codex",
  action: "delete_local",
  dry_run: true,
  target_count: 1,
  valid_count: 1,
  applied_count: 0,
  confirm_token_expected: "tok-1",
  confirm_token_accepted: false,
  backed_up_count: 1,
  backup_before_delete: true,
};

const bulkSessionActionResult: ProviderSessionActionResult = {
  ok: true,
  provider: "codex",
  action: "archive_local",
  dry_run: true,
  target_count: 2,
  valid_count: 2,
  applied_count: 0,
  confirm_token_expected: "tok-bulk",
  confirm_token_accepted: false,
};

describe("SessionDetail", () => {
  it("shows the selected session action summary with preview-ready guidance", () => {
    const html = renderToStaticMarkup(
      <SessionDetail
        messages={messages}
        selectedSession={selectedSession}
        selectedCount={2}
        sessionActionResult={sessionActionResult}
        emptyScopeLabel="Codex"
        emptyNextSessions={[]}
        sessionTranscriptData={null}
        sessionTranscriptLoading={false}
        sessionTranscriptLimit={120}
        setSessionTranscriptLimit={vi.fn()}
        busy={false}
        canRunSessionAction={true}
        providerDeleteBackupEnabled={true}
        setProviderDeleteBackupEnabled={vi.fn()}
        runSingleProviderAction={vi.fn()}
        runSingleProviderHardDelete={vi.fn(() => Promise.resolve(null))}
      />,
    );

    expect(html).toContain("Delete locally · Preview ready");
    expect(html).toContain("Preview ready. Execute from this card when it looks right.");
    expect(html).toContain("tok-1");
    expect(html).toContain("Execute Delete locally");
    expect(html).toContain("2 Rows Selected");
    expect(html).toContain("Archive dry-run");
    expect(html).toContain("Delete dry-run");
    expect(html).toContain("Hard delete");
    expect(html).toContain("Open folder");
    expect(html).toContain("/tmp/rollout-2026-03-29T03-15-34-session-notes.jsonl");
    expect(html).toContain("history");
    expect(html).toContain("rollout-2026-03-29T03-15…notes.jsonl");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain(">Back up<");
    expect(html).not.toContain("What this panel manages");
    expect(html).not.toContain("Format / probe");
    expect(html).not.toContain("jsonl / OK");
    expect(html).not.toContain("These buttons operate on the selected source session file");
    expect(html).toContain("Title source");
    expect(html).toContain("Session ID");
    expect(html).toContain("Path");
    expect(html).toContain("Size");
    expect(html).toContain("128 B");
    expect(html).not.toContain('detail-section detail-section-actions" open=""');
    expect(html).not.toContain('detail-section session-detail-overview-section" open=""');
    expect(html).toContain('detail-section detail-section-transcript" open=""');
  });

  it("does not show a single-session execute card for bulk preview results", () => {
    const html = renderToStaticMarkup(
      <SessionDetail
        messages={messages}
        selectedSession={selectedSession}
        selectedCount={2}
        sessionActionResult={bulkSessionActionResult}
        emptyScopeLabel="Codex"
        emptyNextSessions={[]}
        sessionTranscriptData={null}
        sessionTranscriptLoading={false}
        sessionTranscriptLimit={120}
        setSessionTranscriptLimit={vi.fn()}
        busy={false}
        canRunSessionAction={true}
        providerDeleteBackupEnabled={true}
        setProviderDeleteBackupEnabled={vi.fn()}
        runSingleProviderAction={vi.fn()}
        runSingleProviderHardDelete={vi.fn(() => Promise.resolve(null))}
      />,
    );

    expect(html).not.toContain("Execute Archive locally");
    expect(html).not.toContain("tok-bulk");
  });

  it("uses session-detail messages for the empty state copy", () => {
    const html = renderToStaticMarkup(
      <SessionDetail
        messages={messages}
        selectedSession={null}
        selectedCount={0}
        emptyScopeLabel="Codex"
        emptyNextSessions={[
          {
            title: "Next session",
            path: "/tmp/next-session.jsonl",
            description: "claude · 273MB · Mar 26, 2026, 12:15 AM · largest session in scope",
          },
          {
            title: "Second session",
            path: "/tmp/second-session.jsonl",
            description: "codex · 99MB · Mar 25, 2026, 12:15 AM · largest session in scope",
          },
        ]}
        onOpenSessionPath={vi.fn()}
        sessionTranscriptData={null}
        sessionTranscriptLoading={false}
        sessionTranscriptLimit={120}
        setSessionTranscriptLimit={vi.fn()}
        busy={false}
        canRunSessionAction={false}
        providerDeleteBackupEnabled={true}
        setProviderDeleteBackupEnabled={vi.fn()}
        runSingleProviderAction={vi.fn()}
        runSingleProviderHardDelete={vi.fn(() => Promise.resolve(null))}
      />,
    );

    expect(html).toContain("Open the transcript and manage the local session file.");
    expect(html).toContain("Next session");
    expect(html).toContain("Second session");
    expect(html).toContain("Opens here");
  });
});
