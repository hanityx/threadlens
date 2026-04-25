import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getMessages } from "@/i18n/catalog";
import { UpdateBanner } from "@/app/components/UpdateBanner";

describe("UpdateBanner", () => {
  it("renders the latest version and release link", () => {
    const html = renderToStaticMarkup(
      <UpdateBanner
        messages={getMessages("en").alerts}
        currentVersion="0.1.0"
        latestVersion="0.1.1"
        releaseUrl="https://github.com/hanityx/threadlens/releases/tag/v0.1.1"
        onDismiss={() => undefined}
      />,
    );

    expect(html).toContain("Update available");
    expect(html).toContain("v0.1.1");
    expect(html).toContain("v0.1.0");
    expect(html).toContain("current v0.1.0");
    expect(html).toContain("Open release");
    expect(html).toContain("releases/tag/v0.1.1");
  });

  it("omits release summary text and uses locale-specific current labels", () => {
    const html = renderToStaticMarkup(
      <UpdateBanner
        messages={getMessages("ko").alerts}
        currentVersion="0.1.1"
        latestVersion="0.1.2"
        releaseUrl="https://github.com/hanityx/threadlens/releases/tag/v0.1.2"
        onDismiss={() => undefined}
      />,
    );

    expect(html).toContain("업데이트 가능");
    expect(html).toContain("현재 v0.1.1");
    expect(html).not.toContain("A newer ThreadLens release is available.");
    expect(html).not.toContain("Codex rename sync now reflects immediately.");
  });
});
