import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "@/i18n";
import { ThreadDetail } from "@/features/threads/components/ThreadDetail";

const messages = getMessages("en");

describe("ThreadDetail", () => {
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
    expect(html).toContain("opens here");
    expect(html).toContain("Transcript, local files, and cleanup preview.");
    expect(html).toContain("thread-detail-empty-next-button");
    expect(html).not.toContain("Open first visible row");
    expect(html).not.toContain(">rows<");
    expect(html).not.toContain(">visible<");
    expect(html).not.toContain(">total<");
  });

  it("shows local file evidence instead of a raw artifacts count", () => {
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

    expect(html).toContain("Local files found");
    expect(html).toContain("3 files");
    expect(html).toContain("session log 1");
    expect(html).toContain("archived log 2");
    expect(html).toContain("thread-1.jsonl");
    expect(html).toContain("2 Rows Selected");
    expect(html).not.toContain("review · next steps");
    expect(html).toContain("019d2f65…4d85");
    expect(html).toContain("Earliest loaded");
    expect(html).toContain("Updated");
    expect(html).toContain("Workspace");
    expect(html).toContain("/workspace/threadlens");
    expect(html).toContain("aria-expanded=\"false\"");
    expect(html).not.toContain(">cleanup dry-run<");
    expect(html).not.toContain("<p>sessions</p>");
    expect(html).not.toContain(">Artifacts<");
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
    expect(html).toContain("여기서 열림");
    expect(html).toContain("트랜스크립트, 로컬 파일, cleanup 미리보기를 여기서 확인합니다.");
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
