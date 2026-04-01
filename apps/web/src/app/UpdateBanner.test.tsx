import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getMessages } from "../i18n";
import { UpdateBanner } from "./UpdateBanner";

describe("UpdateBanner", () => {
  it("renders the latest version and release link", () => {
    const html = renderToStaticMarkup(
      <UpdateBanner
        messages={getMessages("en").alerts}
        currentVersion="0.1.0"
        latestVersion="0.1.1"
        releaseSummary="Codex rename sync now reflects immediately."
        releaseUrl="https://github.com/hanityx/threadlens/releases/tag/v0.1.1"
        onDismiss={() => undefined}
      />,
    );

    expect(html).toContain("Update available");
    expect(html).toContain("v0.1.1");
    expect(html).toContain("v0.1.0");
    expect(html).toContain("Codex rename sync now reflects immediately.");
    expect(html).toContain("Open release");
    expect(html).toContain("releases/tag/v0.1.1");
  });
});
