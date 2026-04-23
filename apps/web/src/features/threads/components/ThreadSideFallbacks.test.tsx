import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThreadDetailSlot } from "@/features/threads/components/ThreadDetailSlot";
import { ThreadsForensicsSlot } from "@/features/threads/components/ThreadsForensicsSlot";
import { getMessages } from "@/i18n/catalog";

const messages = getMessages("en");

describe("thread side lazy fallbacks", () => {
  it("uses the shared slot skeleton for thread detail", () => {
    const html = renderToStaticMarkup(
      <ThreadDetailSlot
        messages={messages}
        selectedThread={null}
        selectedThreadId=""
        openThreadById={() => undefined}
        visibleThreadCount={0}
        filteredThreadCount={0}
        nextThreadId=""
        nextThreadTitle=""
        nextThreadSource=""
        searchContext={null}
        threadDetailLoading={false}
        selectedThreadDetail={null}
        threadTranscriptData={null}
        threadTranscriptLoading={false}
        threadTranscriptLimit={40}
        setThreadTranscriptLimit={() => undefined}
        busy={false}
        threadActionsDisabled={false}
        bulkPin={() => undefined}
        bulkUnpin={() => undefined}
        bulkArchive={() => undefined}
        analyzeDelete={() => undefined}
        cleanupDryRun={() => undefined}
        selectedIds={[]}
      />,
    );

    expect(html).toContain("surface-slot-skeleton");
    expect(html).not.toContain("sub-toolbar");
  });

  it("uses the shared slot skeleton for forensics", () => {
    const html = renderToStaticMarkup(
      <ThreadsForensicsSlot
        messages={messages}
        threadActionsDisabled={false}
        selectedIds={[]}
        selectedThreadId=""
        rows={[]}
        busy={false}
        analyzeDelete={() => undefined}
        cleanupDryRun={() => undefined}
        cleanupExecute={() => undefined}
        cleanupData={null}
        pendingCleanup={null}
        selectedImpactRows={[]}
        analysisData={undefined}
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

    expect(html).toContain("surface-slot-skeleton");
    expect(html).not.toContain("skeleton-line");
  });
});
