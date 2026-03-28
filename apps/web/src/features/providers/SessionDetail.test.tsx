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
  file_path: "/tmp/session.jsonl",
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
        sessionActionResult={sessionActionResult}
        emptyScopeLabel="Codex"
        emptyScopeRows={1}
        emptyScopeReady={1}
        emptyNextSessionTitle=""
        sessionTranscriptData={null}
        sessionTranscriptLoading={false}
        sessionTranscriptLimit={120}
        setSessionTranscriptLimit={vi.fn()}
        busy={false}
        canRunSessionAction={true}
        providerDeleteBackupEnabled={true}
        setProviderDeleteBackupEnabled={vi.fn()}
        runSingleProviderAction={vi.fn()}
      />,
    );

    expect(html).toContain("Delete locally · Preview ready");
    expect(html).toContain("Preview ready. Execute from this card when it looks right.");
    expect(html).toContain("tok-1");
    expect(html).toContain("Execute Delete locally");
  });

  it("does not show a single-session execute card for bulk preview results", () => {
    const html = renderToStaticMarkup(
      <SessionDetail
        messages={messages}
        selectedSession={selectedSession}
        sessionActionResult={bulkSessionActionResult}
        emptyScopeLabel="Codex"
        emptyScopeRows={1}
        emptyScopeReady={1}
        emptyNextSessionTitle=""
        sessionTranscriptData={null}
        sessionTranscriptLoading={false}
        sessionTranscriptLimit={120}
        setSessionTranscriptLimit={vi.fn()}
        busy={false}
        canRunSessionAction={true}
        providerDeleteBackupEnabled={true}
        setProviderDeleteBackupEnabled={vi.fn()}
        runSingleProviderAction={vi.fn()}
      />,
    );

    expect(html).not.toContain("Execute Archive locally");
    expect(html).not.toContain("tok-bulk");
  });
});
