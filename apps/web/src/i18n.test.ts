import { describe, expect, it } from "vitest";
import { detectPreferredLocale, getMessages } from "./i18n";

describe("i18n provider flow labels", () => {
  it("exposes flow board labels for English", () => {
    const messages = getMessages("en");
    expect(messages.providers.flowBoardTitle.length).toBeGreaterThan(0);
    expect(messages.providers.flowStageDetect.length).toBeGreaterThan(0);
    expect(messages.providers.flowStatusDone.length).toBeGreaterThan(0);
    expect(messages.providers.flowNextLabel.length).toBeGreaterThan(0);
  });

  it("falls back to English when no saved or browser locale is available", () => {
    expect(detectPreferredLocale({ savedLocale: null, browserLanguage: undefined })).toBe("en");
  });

  it("prefers a saved Korean locale over browser locale", () => {
    expect(detectPreferredLocale({ savedLocale: "ko", browserLanguage: "en-US" })).toBe("ko");
  });

  it("uses a supported browser locale when no saved locale exists", () => {
    expect(detectPreferredLocale({ savedLocale: null, browserLanguage: "ko-KR" })).toBe("ko");
  });
});
