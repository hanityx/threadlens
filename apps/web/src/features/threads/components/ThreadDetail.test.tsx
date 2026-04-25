import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "@/i18n/catalog";
import {
  APPLIED_CLEANUP_CARD_HIDE_MS,
  buildAppliedCleanupKey,
  ThreadDetail,
} from "@/features/threads/components/ThreadDetail";
import { buildThreadCleanupSelectionKey } from "@/shared/lib/appState";

const messages = getMessages("en");

describe("ThreadDetail", () => {
  it("keeps the applied cleanup card visible for three seconds", () => {
    expect(APPLIED_CLEANUP_CARD_HIDE_MS).toBe(3000);
  });

  it("keys applied cleanup cards by deleted backup targets", () => {
    const first = buildAppliedCleanupKey({
      cleanupApplied: true,
      selectedThreadId: "thread-1",
      targetCount: 1,
      deletedCount: 1,
      failedCount: 0,
      targetThreadIds: ["thread-1"],
      targetPaths: ["/tmp/local_cleanup_backups/one.jsonl"],
    });
    const second = buildAppliedCleanupKey({
      cleanupApplied: true,
      selectedThreadId: "thread-1",
      targetCount: 1,
      deletedCount: 1,
      failedCount: 0,
      targetThreadIds: ["thread-1"],
      targetPaths: ["/tmp/local_cleanup_backups/two.jsonl"],
    });

    expect(first).not.toBe(second);
    expect(buildAppliedCleanupKey({ cleanupApplied: false, selectedThreadId: "thread-1", targetCount: 0, deletedCount: 0, failedCount: 0 })).toBe("");
  });

  it("collapses identical visible and total counts into a single rows summary", () => {
    const html = renderToStaticMarkup(
      <ThreadDetail
        messages={messages}
        selectedThread={null}
        selectedThreadId=""
        openThreadById={vi.fn()}
        visibleThreadCount={8}
        filteredThreadCount={8}
        nextThreadId="thread-1"
        nextThreadTitle="Next cleanup candidate"
        nextThreadSource="sessions"
        searchContext={null}
        threadDetailLoading={false}
        selectedThreadDetail={null}
        threadTranscriptData={null}
        threadTranscriptLoading={false}
        threadTranscriptLimit={250}
        setThreadTranscriptLimit={vi.fn()}
        busy={false}
        threadActionsDisabled={false}
        selectedIds={[]}
        bulkPin={vi.fn()}
        bulkUnpin={vi.fn()}
        bulkArchive={vi.fn()}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
      />,
    );

    expect(html).toContain("No thread selected.");
    expect(html.match(/Pick one row to open the full review surface\./g)?.length).toBe(2);
    expect(html).toContain("next pick");
    expect(html).toContain("Next cleanup candidate");
    expect(html).not.toContain("opens here");
    expect(html).not.toContain("Transcript, local files, and cleanup preview.");
    expect(html).toContain("thread-detail-empty-next-button");
    expect(html).not.toContain("Open first visible row");
    expect(html).not.toContain(">rows<");
    expect(html).not.toContain(">visible<");
    expect(html).not.toContain(">total<");
  });

  it("keeps overview metadata and transcript without the duplicate cleanup section", () => {
    const html = renderToStaticMarkup(
      <ThreadDetail
        messages={messages}
        selectedThread={{
          thread_id: "019d2f65-1111-2222-3333-4444444d4d85",
          title: "Cleanup candidate",
          risk_score: 82,
          risk_level: "high",
          is_pinned: false,
          source: "sessions",
          cwd: "/workspace/threadlens",
          timestamp: "2026-03-28T12:30:00.000Z",
        }}
        selectedThreadId="019d2f65-1111-2222-3333-4444444d4d85"
        openThreadById={vi.fn()}
        visibleThreadCount={3}
        filteredThreadCount={8}
        nextThreadId="thread-2"
        nextThreadTitle="next"
        nextThreadSource="sessions"
        searchContext={null}
        threadDetailLoading={false}
        selectedThreadDetail={{
          id: "019d2f65-1111-2222-3333-4444444d4d85",
          title: "Cleanup candidate",
          summary: "Thread has local logs and archive traces.",
          artifact_count: 3,
          artifact_count_by_kind: {
            "session-log": 1,
            "archived-session-log": 2,
          },
          artifact_paths_preview: [
            "/tmp/logs/thread-1.jsonl",
            "/tmp/archive/thread-1-a.jsonl",
            "/tmp/archive/thread-1-b.jsonl",
          ],
          impact: {
            risk_level: "high",
            risk_score: 82,
            parents: [],
            summary: "Review before cleanup.",
          },
        }}
        threadTranscriptData={{
          provider: "codex",
          thread_id: "019d2f65-1111-2222-3333-4444444d4d85",
          file_path: "/tmp/session.jsonl",
          scanned_lines: 24,
          message_count: 2,
          truncated: false,
          messages: [
            {
              idx: 1,
              role: "user",
              text: "hello",
              ts: "2026-03-27T10:00:00.000Z",
              source_type: "jsonl",
            },
            {
              idx: 2,
              role: "assistant",
              text: "world",
              ts: "2026-03-28T11:00:00.000Z",
              source_type: "jsonl",
            },
          ],
        }}
        threadTranscriptLoading={false}
        threadTranscriptLimit={250}
        setThreadTranscriptLimit={vi.fn()}
        busy={false}
        threadActionsDisabled={false}
        selectedIds={["019d2f65-1111-2222-3333-4444444d4d85", "thread-2"]}
        bulkPin={vi.fn()}
        bulkUnpin={vi.fn()}
        bulkArchive={vi.fn()}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
      />,
    );

    expect(html).toContain("2 Rows Selected");
    expect(html).not.toContain("review · next steps");
    expect(html).toContain("019d2f65-1111-2222-3333-4444444d4d85");
    expect(html).toContain("Earliest loaded");
    expect(html).toContain("Updated");
    expect(html).toContain("Workspace");
    expect(html).toContain("/workspace/threadlens");
    expect(html).not.toContain(">Cleanup check<");
    expect(html).not.toContain("Local files found");
    expect(html).toContain(">Pin in Codex<");
    expect(html).toContain(">Unpin in Codex<");
    expect(html).toContain(">Impact analysis<");
    expect(html).not.toContain(">Cleanup dry-run<");
    expect(html).not.toContain(">Hard delete<");
    expect(html).not.toContain(">Local archive<");
    expect(html).not.toContain("<p>sessions</p>");
    expect(html).not.toContain(">Artifacts<");
  });

  it("renders grouped deletion prep actions inside the ready card", () => {
    const analyzeDelete = vi.fn();
    const cleanupExecute = vi.fn();
    const html = renderToStaticMarkup(
      <ThreadDetail
        messages={messages}
        selectedThread={{
          thread_id: "thread-1",
          title: "Cleanup candidate",
          risk_score: 82,
          risk_level: "high",
          is_pinned: false,
          source: "sessions",
          cwd: "/workspace/threadlens",
          timestamp: "2026-03-28T12:30:00.000Z",
        }}
        selectedThreadId="thread-1"
        openThreadById={vi.fn()}
        visibleThreadCount={3}
        filteredThreadCount={8}
        nextThreadId="thread-2"
        nextThreadTitle="next"
        nextThreadSource="sessions"
        searchContext={null}
        threadDetailLoading={false}
        selectedThreadDetail={null}
        threadTranscriptData={null}
        threadTranscriptLoading={false}
        threadTranscriptLimit={250}
        setThreadTranscriptLimit={vi.fn()}
        busy={false}
        threadActionsDisabled={false}
        selectedIds={["thread-2", "thread-1"]}
        bulkPin={vi.fn()}
        bulkUnpin={vi.fn()}
        bulkArchive={vi.fn()}
        analyzeDelete={analyzeDelete}
        cleanupDryRun={vi.fn()}
        cleanupExecute={cleanupExecute}
        cleanupData={{
          ok: true,
          mode: "dry-run",
          confirm_token_expected: "DEL-123",
          target_file_count: 2,
          backup: { backup_dir: "", copied_count: 0 },
          state_result: { changed: true, removed: { titles: 1, order: 0, pinned: 0 } },
        }}
        pendingCleanup={{
          ids: ["thread-2", "thread-1"],
          confirmToken: "DEL-123",
          selectionKey: buildThreadCleanupSelectionKey(["thread-2", "thread-1"]),
          options: {
            delete_cache: true,
            delete_session_logs: true,
            clean_state_refs: true,
          },
        }}
      />,
    );

    expect(html).toContain("Deletion prep ready");
    expect(html).toContain("2 targets");
    expect(html).toContain(">Delete<");
    expect(html).toContain(">Impact analysis<");
    expect(html).toContain("Nothing has been deleted yet.");
    expect(html).toContain("thread-review-card thread-review-card-preview is-ready");
    expect(html).not.toContain("Backups stay local before delete.");
    expect(html).not.toContain("provider-result-card");
    expect(html).not.toContain("DEL-123");
    expect(html.indexOf("Actions")).toBeLessThan(html.indexOf("Deletion prep ready"));
    expect(html.indexOf("Deletion prep ready")).toBeLessThan(html.indexOf("Overview"));
  });

  it("renders delete-complete copy after execute without hard-delete wording in the card", () => {
    const html = renderToStaticMarkup(
      <ThreadDetail
        messages={messages}
        selectedThread={{
          thread_id: "thread-1",
          title: "Cleanup candidate",
          risk_score: 82,
          risk_level: "high",
          is_pinned: false,
          source: "sessions",
          cwd: "/workspace/threadlens",
          timestamp: "2026-03-28T12:30:00.000Z",
        }}
        selectedThreadId="thread-1"
        openThreadById={vi.fn()}
        visibleThreadCount={3}
        filteredThreadCount={8}
        nextThreadId="thread-2"
        nextThreadTitle="next"
        nextThreadSource="sessions"
        searchContext={null}
        threadDetailLoading={false}
        selectedThreadDetail={null}
        threadTranscriptData={null}
        threadTranscriptLoading={false}
        threadTranscriptLimit={250}
        setThreadTranscriptLimit={vi.fn()}
        busy={false}
        threadActionsDisabled={false}
        selectedIds={["thread-2", "thread-1"]}
        bulkPin={vi.fn()}
        bulkUnpin={vi.fn()}
        bulkArchive={vi.fn()}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
        cleanupExecute={vi.fn()}
        cleanupData={{
          ok: true,
          mode: "execute",
          target_file_count: 2,
          deleted_file_count: 2,
          failed: [],
          backup: { backup_dir: "/tmp/backups/threadlens", copied_count: 2 },
          state_result: { changed: true, removed: { titles: 1, order: 0, pinned: 0 } },
        }}
        pendingCleanup={null}
      />,
    );

    expect(html).toContain("Delete completed");
    expect(html).toContain("2/2 deleted · 0 failed");
    expect(html).toContain("Selected files were deleted. Review failures or the backup path if needed.");
    expect(html).not.toContain("Hard delete · Applied");
  });

  it("suppresses the search fallback notice after delete completion removes the focused thread from the index", () => {
    const html = renderToStaticMarkup(
      <ThreadDetail
        messages={messages}
        selectedThread={null}
        selectedThreadId="thread-1"
        openThreadById={vi.fn()}
        visibleThreadCount={2}
        filteredThreadCount={2}
        nextThreadId="thread-2"
        nextThreadTitle="next"
        nextThreadSource="sessions"
        searchContext={{
          provider: "claude",
          session_id: "session-1",
          thread_id: "thread-1",
          title: "Deleted thread",
          display_title: "Deleted thread",
          file_path: "/tmp/deleted-thread.jsonl",
          mtime: "2026-03-28T12:30:00.000Z",
          match_kind: "message",
          snippet: "match",
        }}
        threadDetailLoading={false}
        selectedThreadDetail={null}
        threadTranscriptData={null}
        threadTranscriptLoading={false}
        threadTranscriptLimit={250}
        setThreadTranscriptLimit={vi.fn()}
        busy={false}
        threadActionsDisabled={false}
        selectedIds={[]}
        bulkPin={vi.fn()}
        bulkUnpin={vi.fn()}
        bulkArchive={vi.fn()}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
        cleanupExecute={vi.fn()}
        cleanupData={{
          ok: true,
          mode: "execute",
          target_file_count: 1,
          deleted_file_count: 1,
          failed: [],
          targets: [{ path: "/tmp/deleted-thread.jsonl", thread_id: "thread-1" }],
          backup: { backup_dir: "/tmp/backups/threadlens", copied_count: 1 },
          state_result: { changed: true, removed: { titles: 1, order: 0, pinned: 0 } },
        }}
        pendingCleanup={null}
      />,
    );

    expect(html).toContain("Delete completed");
    expect(html).not.toContain("Thread opened directly from Search");
    expect(html).not.toContain(
      "This thread is not present in the current cleanup index, but Search found its raw transcript and ID so you can still inspect it directly.",
    );
  });

  it("treats a focused thread as detail context, not as an explicit row selection", () => {
    const html = renderToStaticMarkup(
      <ThreadDetail
        messages={messages}
        selectedThread={{
          thread_id: "019d2f65-1111-2222-3333-4444444d4d85",
          title: "Cleanup candidate",
          risk_score: 82,
          risk_level: "high",
          is_pinned: false,
          source: "sessions",
          cwd: "/workspace/threadlens",
          timestamp: "2026-03-28T12:30:00.000Z",
        }}
        selectedThreadId="019d2f65-1111-2222-3333-4444444d4d85"
        openThreadById={vi.fn()}
        visibleThreadCount={3}
        filteredThreadCount={8}
        nextThreadId="thread-2"
        nextThreadTitle="next"
        nextThreadSource="sessions"
        searchContext={null}
        threadDetailLoading={false}
        selectedThreadDetail={null}
        threadTranscriptData={null}
        threadTranscriptLoading={false}
        threadTranscriptLimit={250}
        setThreadTranscriptLimit={vi.fn()}
        busy={false}
        threadActionsDisabled={false}
        selectedIds={[]}
        bulkPin={vi.fn()}
        bulkUnpin={vi.fn()}
        bulkArchive={vi.fn()}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
      />,
    );

    expect(html).toContain("Thread Detail");
    expect(html).not.toContain("Selected Thread Detail");
    expect(html).not.toContain("1 Row Selected");
  });

  it("shows a selection-ready state when rows are checked but detail focus is still closed", () => {
    const html = renderToStaticMarkup(
      <ThreadDetail
        messages={messages}
        selectedThread={null}
        selectedThreadId=""
        openThreadById={vi.fn()}
        visibleThreadCount={3}
        filteredThreadCount={8}
        nextThreadId="thread-2"
        nextThreadTitle="next"
        nextThreadSource="sessions"
        searchContext={null}
        threadDetailLoading={false}
        selectedThreadDetail={null}
        threadTranscriptData={null}
        threadTranscriptLoading={false}
        threadTranscriptLimit={250}
        setThreadTranscriptLimit={vi.fn()}
        busy={false}
        threadActionsDisabled={false}
        selectedIds={["thread-1"]}
        bulkPin={vi.fn()}
        bulkUnpin={vi.fn()}
        bulkArchive={vi.fn()}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
      />,
    );

    expect(html).toContain("1 Row Selected");
    expect(html).toContain("Selection ready");
    expect(html).toContain("Open selected row");
    expect(html).not.toContain("No thread selected.");
    expect(html).not.toContain("Selected rows stay in the action rail below.");
  });

  it("renders Korean thread-detail copy with localized helper labels", () => {
    const koMessages = getMessages("ko");
    const html = renderToStaticMarkup(
      <ThreadDetail
        messages={koMessages}
        selectedThread={null}
        selectedThreadId=""
        openThreadById={vi.fn()}
        visibleThreadCount={8}
        filteredThreadCount={8}
        nextThreadId="thread-1"
        nextThreadTitle="다음 정리 후보"
        nextThreadSource="sessions"
        searchContext={null}
        threadDetailLoading={false}
        selectedThreadDetail={null}
        threadTranscriptData={null}
        threadTranscriptLoading={false}
        threadTranscriptLimit={250}
        setThreadTranscriptLimit={vi.fn()}
        busy={false}
        threadActionsDisabled={false}
        selectedIds={[]}
        bulkPin={vi.fn()}
        bulkUnpin={vi.fn()}
        bulkArchive={vi.fn()}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
      />,
    );

    expect(html).toContain("선택한 스레드가 없습니다.");
    expect(html).toContain("다음 후보");
    expect(html).toContain("다음 정리 후보");
    expect(html).not.toContain("여기서 열림");
    expect(html).not.toContain("트랜스크립트, 로컬 파일, cleanup 미리보기를 여기서 확인합니다.");
  });

  it("renders Korean fallback thread title and source label in detail view", () => {
    const koMessages = getMessages("ko");
    const html = renderToStaticMarkup(
      <ThreadDetail
        messages={koMessages}
        selectedThread={{
          thread_id: "019d2f65-1111-2222-3333-4444444d4d85",
          title: "",
          risk_score: 82,
          risk_level: "high",
          is_pinned: false,
          source: "sessions",
          cwd: "/workspace/threadlens",
          timestamp: "2026-03-28T12:30:00.000Z",
        }}
        selectedThreadId="019d2f65-1111-2222-3333-4444444d4d85"
        openThreadById={vi.fn()}
        visibleThreadCount={3}
        filteredThreadCount={8}
        nextThreadId="thread-2"
        nextThreadTitle="next"
        nextThreadSource="sessions"
        searchContext={null}
        threadDetailLoading={false}
        selectedThreadDetail={null}
        threadTranscriptData={null}
        threadTranscriptLoading={false}
        threadTranscriptLimit={250}
        setThreadTranscriptLimit={vi.fn()}
        busy={false}
        threadActionsDisabled={false}
        selectedIds={[]}
        bulkPin={vi.fn()}
        bulkUnpin={vi.fn()}
        bulkArchive={vi.fn()}
        analyzeDelete={vi.fn()}
        cleanupDryRun={vi.fn()}
      />,
    );

    expect(html).toContain("스레드 019d2f65");
    expect(html).toContain(">세션</span>");
  });
});
