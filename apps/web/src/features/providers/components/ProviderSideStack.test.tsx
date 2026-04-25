import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getMessages } from "@/i18n/catalog";
import { ProviderSideStack } from "@/features/providers/components/ProviderSideStack";

describe("ProviderSideStack", () => {
  it("renders both session detail and parser slots when advanced mode is open", () => {
    const messages = getMessages("ja");
    const html = renderToStaticMarkup(
      <ProviderSideStack
        messages={messages}
        advancedOpen
        sessionDetailSlot={<div>Session detail slot</div>}
        backupHubSlot={<div>Backup slot</div>}
        parserSlot={<div>Parser slot</div>}
      />,
    );

    expect(html).toContain("provider-side-stack");
    expect(html).toContain("Session detail slot");
    expect(html).toContain(messages.providers.backupHubTitle);
    expect(html).toContain('data-testid="provider-backup-hub-section" open=""');
    expect(html).toContain("Backup slot");
    expect(html).toContain("Parser slot");
  });

  it("hides the parser slot when advanced mode is closed", () => {
    const messages = getMessages("ja");
    const html = renderToStaticMarkup(
      <ProviderSideStack
        messages={messages}
        advancedOpen={false}
        sessionDetailSlot={<div>Session detail slot</div>}
        parserSlot={<div>Parser slot</div>}
      />,
    );

    expect(html).toContain("Session detail slot");
    expect(html).not.toContain("Parser slot");
  });
});
