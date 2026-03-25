import { describe, expect, it } from "vitest";
import { detectPreferredLocale, getMessages } from "./i18n";

describe("i18n provider flow labels", () => {
  it("uses ThreadLens as the product title for the English-only runtime", () => {
    expect(getMessages("en").hero.title).toBe("ThreadLens");
  });

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

  it("ignores a saved Korean locale while English-only mode is active", () => {
    expect(detectPreferredLocale({ savedLocale: "ko", browserLanguage: "en-US" })).toBe("en");
  });

  it("ignores a Korean browser locale while English-only mode is active", () => {
    expect(detectPreferredLocale({ savedLocale: null, browserLanguage: "ko-KR" })).toBe("en");
  });
});
