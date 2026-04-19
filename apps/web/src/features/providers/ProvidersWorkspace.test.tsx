import { describe, expect, it } from "vitest";
import type { ProviderSessionRow } from "../../types";
import { buildProvidersWorkspaceState, pickLargestSessionCandidates } from "./providersWorkspaceModel";
import { getMessages } from "../../i18n";

function buildSessionRow(
  title: string,
  sizeBytes: number,
  filePath: string,
  provider = "claude",
): ProviderSessionRow {
  return {
    provider,
    source: "sessions",
    session_id: `${title}-id`,
    display_title: title,
    file_path: filePath,
    size_bytes: sizeBytes,
    mtime: "2026-03-29T02:35:00.000Z",
    probe: {
      ok: true,
      format: "jsonl",
      error: null,
      detected_title: title,
      title_source: "header",
    },
  };
}

describe("ProvidersWorkspace", () => {
  it("prefers the two largest visible sessions for the empty-state next cards", () => {
    const sessionRows = [
      buildSessionRow("Small session", 2_048, "/tmp/small.jsonl"),
      buildSessionRow("Second largest", 8_192_000, "/tmp/second.jsonl", "claude"),
      buildSessionRow("Largest session", 12_582_912, "/tmp/large.jsonl", "codex"),
    ];

    const candidates = pickLargestSessionCandidates(sessionRows, 2);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]?.display_title).toBe("Largest session");
    expect(candidates[0]?.file_path).toBe("/tmp/large.jsonl");
    expect(candidates[0]?.provider).toBe("codex");
    expect(candidates[1]?.display_title).toBe("Second largest");
  });

  it("builds session detail state from selected rows and action selection", () => {
    const selectedSession = buildSessionRow("Focused session", 4_096, "/tmp/focused.jsonl", "codex");
    const state = buildProvidersWorkspaceState({
      messages: getMessages("en"),
      providerSessionRows: [selectedSession],
      selectedProviderFiles: {
        "/tmp/focused.jsonl": true,
      },
      emptySessionNextTitle: "",
      emptySessionNextPath: "",
      selectedSession,
      providerActionData: {
        ok: true,
        provider: "codex",
        action: "archive_local",
        dry_run: false,
        target_count: 1,
        valid_count: 1,
        applied_count: 1,
        confirm_token_expected: "",
        confirm_token_accepted: true,
      },
      providerActionSelection: {
        provider: "codex",
        action: "archive_local",
        file_paths: ["/tmp/focused.jsonl"],
        dry_run: false,
      },
    });

    expect(state.selectedSessionCount).toBe(1);
    expect(state.sessionDetailKey).toBe("/tmp/focused.jsonl");
    expect(state.selectedSessionActionResult?.provider).toBe("codex");
    expect(state.emptyNextSessions[0]?.title).toContain("Focused session");
  });
});
