import { describe, expect, it } from "vitest";
import { getMessages } from "./i18n";

describe("i18n provider flow labels", () => {
  it("exposes flow board labels for English", () => {
    const messages = getMessages("en");
    expect(messages.providers.flowBoardTitle.length).toBeGreaterThan(0);
    expect(messages.providers.flowStageDetect.length).toBeGreaterThan(0);
    expect(messages.providers.flowStatusDone.length).toBeGreaterThan(0);
    expect(messages.providers.flowNextLabel.length).toBeGreaterThan(0);
  });
});
