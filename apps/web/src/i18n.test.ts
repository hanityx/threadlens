import { describe, expect, it } from "vitest";
import { detectPreferredLocale, getMessages } from "./i18n/index";

describe("i18n provider flow labels", () => {
  const nonEnglishLocales = ["zh-CN", "hi", "es", "pt-BR", "ru", "id", "de", "ja", "ko"] as const;
  const localizedContentLocales = ["zh-CN", "hi", "es", "pt-BR", "ru", "id", "de", "ja"] as const;

  it("uses ThreadLens as the product title for English", () => {
    expect(getMessages("en").hero.title).toBe("ThreadLens");
  });

  it("exposes flow board labels for English", () => {
    const messages = getMessages("en");
    expect(messages.providers.flowBoardTitle.length).toBeGreaterThan(0);
    expect(messages.providers.flowStageDetect.length).toBeGreaterThan(0);
    expect(messages.providers.flowStatusDone.length).toBeGreaterThan(0);
    expect(messages.providers.flowNextLabel.length).toBeGreaterThan(0);
  });

  it.each(nonEnglishLocales)("keeps top-level IA in English for %s", (locale) => {
    const messages = getMessages(locale);
    expect(messages.nav.overview).toBe("Overview");
    expect(messages.nav.search).toBe("Search");
    expect(messages.nav.threads).toBe("Thread");
    expect(messages.nav.providers).toBe("Sessions");
    expect(messages.nav.routing).toBe("AI Diagnostics");
  });

  it.each(nonEnglishLocales)("keeps brand and canonical titles in English for %s", (locale) => {
    const messages = getMessages(locale);
    expect(messages.hero.title).toBe("ThreadLens");
  });

  it.each(nonEnglishLocales)("keeps canonical status and scope glossary in English for %s", (locale) => {
    const messages = getMessages(locale);
    expect(messages.nav.light).toBe("☀ Light");
    expect(messages.nav.dark).toBe("◑ Dark");
    expect(messages.common.allAi).toBe("All Providers");
    expect(messages.common.ok).toBe("OK");
    expect(messages.common.fail).toBe("Fail");
    expect(messages.search.allProviders).toBe("All local AI");
    expect(messages.overview.readyLabel).toBe("ready");
    expect(messages.overview.failLabel).toBe("fail");
    expect(messages.forensics.stageReady).toBe("Ready");
    expect(messages.forensics.stagePending).toBe("Pending");
    expect(messages.threadsTable.workflowSelectedTitle).toBe("Current selection");
    expect(messages.threadsTable.workflowImpactTitle).toBe("Impact analysis");
    expect(messages.threadsTable.workflowDryRunTitle).toBe("Cleanup dry-run");
  });

  it.each(localizedContentLocales)("localizes high-visibility helper copy for %s", (locale) => {
    const messages = getMessages(locale);
    const english = getMessages("en");
    expect(messages.nav.jumpPlaceholder).not.toBe(english.nav.jumpPlaceholder);
    expect(messages.search.inputPlaceholder).not.toBe(english.search.inputPlaceholder);
    expect(messages.overview.heroBody).not.toBe(english.overview.heroBody);
    expect(messages.overview.waitingThreads).not.toBe(english.overview.waitingThreads);
    expect(messages.overview.noRecentSessions).not.toBe(english.overview.noRecentSessions);
    expect(messages.overview.noAdditionalReviewThreads).not.toBe(english.overview.noAdditionalReviewThreads);
    expect(messages.overview.today.length).toBeGreaterThan(0);
    expect(messages.overview.yesterday.length).toBeGreaterThan(0);
  });

  it("localizes routing panel copy while keeping core runtime terms stable", () => {
    const messages = getMessages("es");
    const english = getMessages("en");
    expect(messages.alerts.runtimeIssuesTitle).toBe("Problemas de runtime");
    expect(messages.alerts.runtimeIssuesBody.length).toBeGreaterThan(0);
    expect(messages.routing.storageMapEyebrow.length).toBeGreaterThan(0);
    expect(messages.routing.providersTitle.length).toBeGreaterThan(0);
    expect(messages.routing.contextTitle.length).toBeGreaterThan(0);
    expect(messages.routing.profileSessionModel.length).toBeGreaterThan(0);
    expect(messages.routing.profileResumeModel.length).toBeGreaterThan(0);
    expect(messages.routing.profileCleanupModel.length).toBeGreaterThan(0);
    expect(messages.routing.profilePrimarySurface.length).toBeGreaterThan(0);
    expect(messages.routing.flowEdges.length).toBeGreaterThan(0);
    expect(messages.routing.storageMapEyebrow).not.toBe(english.routing.storageMapEyebrow);
    expect(messages.providers.hubTitle.length).toBeGreaterThan(0);
    expect(messages.providers.sessionsTitle.length).toBeGreaterThan(0);
    expect(messages.providers.hubMetricArchived.length).toBeGreaterThan(0);
    expect(messages.providers.hubMetricParse.length).toBeGreaterThan(0);
    expect(messages.providers.hubMetricSynced.length).toBeGreaterThan(0);
    expect(messages.providers.colProvider.length).toBeGreaterThan(0);
    expect(messages.providers.parserLinkedBadge.length).toBeGreaterThan(0);
    expect(messages.providers.parserLinkedFails.length).toBeGreaterThan(0);
    expect(messages.providers.parserLinkedOpen.length).toBeGreaterThan(0);
    expect(messages.providers.loadMoreRows.length).toBeGreaterThan(0);
    expect(messages.threadDetail.title.length).toBeGreaterThan(0);
    expect(messages.sessionDetail.title.length).toBeGreaterThan(0);
    expect(messages.threadsTable.heroTitle).toBe("Review & Archive");
    expect(messages.transcript.title.length).toBeGreaterThan(0);
    expect(messages.transcript.partial.length).toBeGreaterThan(0);
  });

  it("localizes parser and runtime helper copy in Russian", () => {
    const messages = getMessages("ru");
    const english = getMessages("en");
    expect(messages.nav.jumpPlaceholder).not.toBe(english.nav.jumpPlaceholder);
    expect(messages.errors.runtime).not.toBe(english.errors.runtime);
    expect(messages.errors.parserHealth).not.toBe(english.errors.parserHealth);
    expect(messages.overview.loadingParserRuntime).not.toBe(english.overview.loadingParserRuntime);
    expect(messages.routing.contextNoParserReport).not.toBe(english.routing.contextNoParserReport);
    expect(messages.overview.heroBody).not.toBe(english.overview.heroBody);
  });

  it.each(localizedContentLocales)("keeps review metadata labels stable while helper copy localizes for %s", (locale) => {
    const messages = getMessages(locale);
    const english = getMessages("en");
    expect(messages.overview.noAdditionalReviewThreads).not.toBe(english.overview.noAdditionalReviewThreads);
    expect(messages.overview.reviewMetaFallbackSource).not.toBe(english.overview.reviewMetaFallbackSource);
    expect(messages.overview.reviewSourceSessions).not.toBe(english.overview.reviewSourceSessions);
  });

  it("falls back to English when an unsupported locale is requested", () => {
    expect(getMessages("fr").nav.overview).toBe("Overview");
  });

  it("falls back to English when no saved or browser locale is available", () => {
    expect(detectPreferredLocale({ savedLocale: null, browserLanguage: undefined })).toBe("en");
  });

  it.each([
    ["ko", "en-US", "ko"],
    ["en", "ko-KR", "en"],
    [null, "pt-PT", "pt-BR"],
    [null, "zh-Hans", "zh-CN"],
    [null, "ru-RU", "ru"],
  ] as const)(
    "detectPreferredLocale resolves saved=%s browser=%s to %s",
    (savedLocale, browserLanguage, expected) => {
      expect(detectPreferredLocale({ savedLocale, browserLanguage })).toBe(expected);
    },
  );
});
