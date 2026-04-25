import { describe, expect, it } from "vitest";
import { detectPreferredLocale } from "@/i18n";
import { getMessages } from "@/i18n/catalog";
import { LOCALE_LABELS, LOCALE_SHORT_LABELS } from "@/i18n/locales";

describe("i18n provider flow labels", () => {
  const nonEnglishLocales = ["zh-CN", "hi", "es", "pt-BR", "ru", "id", "de", "ja", "ko"] as const;
  const localizedContentLocales = ["zh-CN", "hi", "es", "pt-BR", "ru", "id", "de", "ja"] as const;
  const stableGlossaryLocales = ["zh-CN", "hi", "es", "pt-BR", "ru", "id", "de", "ja"] as const;

  it("uses ThreadLens as the product title for English", () => {
    expect(getMessages("en").hero.title).toBe("ThreadLens");
  });

  it("keeps Korean second in locale picker order", () => {
    expect(Object.keys(LOCALE_LABELS).slice(0, 2)).toEqual(["en", "ko"]);
    expect(Object.keys(LOCALE_SHORT_LABELS).slice(0, 2)).toEqual(["en", "ko"]);
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
  });

  it("keeps the thread hero title in English while localizing Korean workflow actions", () => {
    const messages = getMessages("ko");
    expect(messages.threadsTable.heroTitle).toBe("Review & Archive");
    expect(messages.threadsTable.workflowSelectedTitle).toBe("현재 선택");
    expect(messages.threadsTable.workflowImpactTitle).toBe("영향도 분석");
    expect(messages.threadsTable.workflowDryRunTitle).toBe("삭제 준비");
    expect(messages.providers.workflowArchiveTitle).toBe("선택 항목 보관");
    expect(messages.providers.workflowDeleteTitle).toBe("삭제 준비");
    expect(messages.providers.archiveDryRun).toBe("선택 항목 보관");
    expect(messages.providers.deleteDryRun).toBe("삭제 준비");
    expect(messages.sessionDetail.archiveDryRun).toBe("보관 준비");
    expect(messages.sessionDetail.deleteDryRun).toBe("삭제 준비");
    expect(messages.sessionDetail.delete).toBe("삭제");
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

  it.each(stableGlossaryLocales)(
    "keeps diagnostics glossary concise and stable for %s",
    (locale) => {
      const messages = getMessages(locale);
      const english = getMessages("en");
      expect(messages.providers.advancedSummaryPillOpen).toBe(english.providers.advancedSummaryPillOpen);
      expect(messages.providers.advancedSummaryPillHide).toBe(english.providers.advancedSummaryPillHide);
      expect(messages.routing.sessionSurfacePillOpen).toBe(english.routing.sessionSurfacePillOpen);
      expect(messages.routing.sessionSurfacePillHide).toBe(english.routing.sessionSurfacePillHide);
      expect(messages.providers.parserTriageAction).toBe(english.providers.parserTriageAction);
      expect(messages.providers.parserTriageStable).toBe(english.providers.parserTriageStable);
      expect(messages.routing.workbenchNoteCodex).toBe(english.routing.workbenchNoteCodex);
      expect(messages.routing.workbenchNoteClaude).toBe(english.routing.workbenchNoteClaude);
      expect(messages.routing.workbenchNoteGemini).toBe(english.routing.workbenchNoteGemini);
      expect(messages.routing.workbenchNoteCopilot).toBe(english.routing.workbenchNoteCopilot);
      expect(messages.routing.profileCopilotSessionValue).toBe(english.routing.profileCopilotSessionValue);
      expect(messages.routing.profileCopilotSessionHint).toBe(english.routing.profileCopilotSessionHint);
      expect(messages.routing.profileCopilotCleanupValue).toBe(english.routing.profileCopilotCleanupValue);
      expect(messages.routing.profileCopilotCleanupHint).toBe(english.routing.profileCopilotCleanupHint);
      expect(messages.routing.profileCopilotSurfaceValue).toBe(english.routing.profileCopilotSurfaceValue);
      expect(messages.routing.profileCopilotSurfaceHint).toBe(english.routing.profileCopilotSurfaceHint);
    },
  );

  it.each(nonEnglishLocales)("localizes diagnostics runtime labels for %s", (locale) => {
    const messages = getMessages(locale);
    const english = getMessages("en");
    expect(messages.routing.globalState).not.toBe(english.routing.globalState);
    expect(messages.routing.reasonRuntime).not.toBe(english.routing.reasonRuntime);
    expect(messages.routing.reasonParserHandoff).not.toBe(english.routing.reasonParserHandoff);
    expect(messages.routing.reasonGlobalState).not.toBe(english.routing.reasonGlobalState);
    expect(messages.routing.reasonDryRun).not.toBe(english.routing.reasonDryRun);
    expect(messages.routing.kindRuntime).not.toBe(english.routing.kindRuntime);
  });

  it("exposes distinct forensics impact summary labels in English and Korean", () => {
    const english = getMessages("en");
    const korean = getMessages("ko");
    expect(english.forensics.signalBreakdownTitle).toBe("Why this score");
    expect(korean.forensics.signalBreakdownTitle).toBe("왜 이 점수인지");
    expect(english.forensics.cleanupReadyHeadline).toBe("Deletion prep ready");
    expect(korean.forensics.cleanupReadyHeadline).toBe("삭제 준비 완료");
    expect(english.forensics.cleanupPendingHeadline).toBe("Deletion prep");
    expect(korean.forensics.cleanupPendingHeadline).toBe("삭제 준비");
    expect(english.forensics.cleanupCompletedHeadline).toBe("Delete completed");
    expect(korean.forensics.cleanupCompletedHeadline).toBe("삭제 완료");
    expect(english.forensics.cleanupCompletedBody).toBe(
      "Selected files were deleted. Review failures or the backup path if needed.",
    );
    expect(korean.forensics.cleanupCompletedBody).toBe(
      "선택한 파일을 삭제했습니다. 필요하면 실패 항목이나 백업 경로를 확인하세요.",
    );
    expect(korean.forensics.executeCleanup).toBe("강제 삭제");
    expect(korean.forensics.rawExecute).toBe("강제 삭제 payload (JSON)");
    expect(korean.forensics.rawDryRun).toBe("삭제 준비 payload (JSON)");
    expect(english.forensics.signalDetailsTitle).toBe("Scoring details");
    expect(korean.forensics.signalDetailsTitle).toBe("점수 세부정보");
    expect(english.forensics.localImpactTitle).toBe("Local cleanup impact");
    expect(korean.forensics.localImpactTitle).toBe("로컬 정리 영향");
    expect(english.forensics.localImpactSummary).toBe("Local changes");
    expect(korean.forensics.localImpactSummary).toBe("로컬 변경");
    expect(english.forensics.signalScopeNote).toBe("Based on local size, state, and cleanup flags.");
    expect(korean.forensics.signalScopeNote).toBe("로컬 크기, 상태, cleanup 플래그 기준입니다.");
    expect(english.forensics.riskLevelMedium).toBe("Medium");
    expect(korean.forensics.riskLevelMedium).toBe("중간");
    expect(english.forensics.impactRemovedFilesCard).toBe("Removed locally");
    expect(english.forensics.impactSeparateFilesCard).toBe("Stored separately");
    expect(korean.forensics.impactRemovedFilesCard).toBe("삭제 예정");
    expect(korean.forensics.impactSeparateFilesCard).toBe("별도 보관");
    expect(english.forensics.localImpactStorageCard).toBe("Local storage");
    expect(korean.forensics.localImpactStorageCard).toBe("로컬 저장소");
    expect(english.forensics.impactRowsDetailTitle).toBe("Affected rows");
    expect(korean.forensics.impactRowsDetailTitle).toBe("영향 항목");
    expect(english.forensics.impactScopeNote).toBe("Local refs and storage only.");
    expect(korean.forensics.impactScopeNote).toBe("로컬 참조와 저장소만 봅니다.");
    expect(english.forensics.crossSessionTitle).toBe("Cross-session links");
    expect(korean.forensics.crossSessionTitle).toBe("세션 간 연결");
    expect(english.forensics.crossSessionSummaryTitle).toBe("Referencing sessions");
    expect(korean.forensics.crossSessionSummaryTitle).toBe("참조한 세션");
    expect(english.forensics.crossSessionScopeNote).toBe("Recent Codex logs only. Use as a cleanup hint.");
    expect(korean.forensics.crossSessionScopeNote).toBe("최근 Codex 로그 기준입니다. 정리 판단용 힌트입니다.");
    expect(english.forensics.crossSessionStrongCard).toBe("Direct links");
    expect(korean.forensics.crossSessionStrongCard).toBe("직접 연결");
    expect(english.forensics.crossSessionMentionCard).toBe("In logs");
    expect(korean.forensics.crossSessionMentionCard).toBe("로그 언급");
    expect(english.forensics.crossSessionTechnicalDetails).toBe("Reference details");
    expect(korean.forensics.crossSessionTechnicalDetails).toBe("참조 세부정보");
    expect(english.forensics.crossSessionMetadataDetails).toBe("Log metadata");
    expect(korean.forensics.crossSessionMetadataDetails).toBe("로그 메타데이터");
    expect(english.forensics.technicalPayload).toBe("Diagnostic data");
    expect(korean.forensics.technicalPayload).toBe("진단 데이터");
    expect(english.forensics.crossSessionMatchedExcerptLabel).toBe("Matched snippet");
    expect(korean.forensics.crossSessionMatchedExcerptLabel).toBe("잡힌 문구");
    expect(english.forensics.crossSessionRelationSummaryLabel).toBe("Relation summary");
    expect(korean.forensics.crossSessionRelationSummaryLabel).toBe("관계 요약");
    expect(english.forensics.signalFactMessages).toBe("~{count} msgs (size-based)");
    expect(korean.forensics.signalFactMessages).toBe("파일 크기 환산 메시지 약 {count}개");
    expect(english.forensics.signalFactMessagesCapped).toBe("{count}+ msgs (size-based)");
    expect(korean.forensics.signalFactMessagesCapped).toBe("파일 크기 환산 메시지 {count}+");
    expect(english.forensics.signalFactTools).toBe("~{count} tools (size-based)");
    expect(korean.forensics.signalFactTools).toBe("파일 크기 환산 도구 호출 약 {count}개");
    expect(english.forensics.signalDriversLabel).toBe("Top drivers");
    expect(korean.forensics.signalDriversLabel).toBe("상위 이유");
    expect(english.forensics.signalEstimatesLabel).toBe("Context basis");
    expect(korean.forensics.signalEstimatesLabel).toBe("컨텍스트 근거");
    expect(english.forensics.impactChangeSeparateLogs).toBe(
      "Session logs are stored separately and remain unless cleaned up separately",
    );
    expect(korean.forensics.impactChangeSeparateLogs).toBe(
      "세션 로그는 별도 보관되며 따로 정리하지 않으면 남습니다.",
    );
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
