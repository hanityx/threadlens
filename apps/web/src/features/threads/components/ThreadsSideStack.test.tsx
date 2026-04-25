import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "@/i18n/catalog";
import { ThreadsSideStack } from "@/features/threads/components/ThreadsSideStack";

vi.mock("./ThreadDetailSlot", () => ({
  ThreadDetailSlot: () => <div data-slot="thread-detail" />,
}));

vi.mock("./ThreadsForensicsSlot", () => ({
  ThreadsForensicsSlot: () => <div data-slot="thread-forensics" />,
}));

const messages = getMessages("en");

describe("ThreadsSideStack", () => {
  it("keeps thread detail above cleanup check in the right-side stack", () => {
    const html = renderToStaticMarkup(
      <ThreadsSideStack
        showForensics={true}
        threadSideStackRef={() => undefined}
        activePanelHeight={null}
        detailProps={{
          messages,
          selectedThread: null,
          selectedThreadId: "thread-1",
          openThreadById: () => undefined,
          visibleThreadCount: 1,
          filteredThreadCount: 1,
          nextThreadId: "",
          nextThreadTitle: "",
          nextThreadSource: "",
          searchContext: null,
          threadDetailLoading: false,
          selectedThreadDetail: null,
          threadTranscriptData: null,
          threadTranscriptLoading: false,
          threadTranscriptLimit: 40,
          setThreadTranscriptLimit: () => undefined,
          busy: false,
          threadActionsDisabled: false,
          bulkPin: () => undefined,
          bulkUnpin: () => undefined,
          bulkArchive: () => undefined,
          analyzeDelete: () => undefined,
          cleanupDryRun: () => undefined,
          openThreadFolder: () => undefined,
          folderOpenNotice: "",
          selectedIds: ["thread-1"],
        }}
        forensicsProps={{
          messages,
          threadActionsDisabled: false,
          selectedIds: ["thread-1"],
          selectedThreadId: "thread-1",
          rows: [],
          busy: false,
          analyzeDelete: () => undefined,
          cleanupDryRun: () => undefined,
          cleanupExecute: () => undefined,
          cleanupData: null,
          pendingCleanup: null,
          selectedImpactRows: [],
          analysisData: undefined,
          analysisRaw: null,
          cleanupRaw: null,
          analyzeDeleteError: false,
          cleanupDryRunError: false,
          cleanupExecuteError: false,
          analyzeDeleteErrorMessage: "",
          cleanupDryRunErrorMessage: "",
          cleanupExecuteErrorMessage: "",
        }}
      />,
    );

    expect(html.indexOf('data-slot="thread-detail"')).toBeLessThan(
      html.indexOf('data-slot="thread-forensics"'),
    );
  });
});
