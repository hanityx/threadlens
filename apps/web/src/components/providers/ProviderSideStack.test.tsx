import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProviderSideStack } from "./ProviderSideStack";

describe("ProviderSideStack", () => {
  it("renders both session detail and parser slots when advanced mode is open", () => {
    const html = renderToStaticMarkup(
      <ProviderSideStack
        advancedOpen
        sessionDetailSlot={<div>Session detail slot</div>}
        parserSlot={<div>Parser slot</div>}
      />,
    );

    expect(html).toContain("provider-side-stack");
    expect(html).toContain("Session detail slot");
    expect(html).toContain("Parser slot");
  });

  it("hides the parser slot when advanced mode is closed", () => {
    const html = renderToStaticMarkup(
      <ProviderSideStack
        advancedOpen={false}
        sessionDetailSlot={<div>Session detail slot</div>}
        parserSlot={<div>Parser slot</div>}
      />,
    );

    expect(html).toContain("Session detail slot");
    expect(html).not.toContain("Parser slot");
  });
});
