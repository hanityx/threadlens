import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "@/i18n/catalog";
import {
  RuntimeFeedbackStack,
  type RuntimeFeedbackStackProps,
} from "@/app/components/RuntimeFeedbackStack";

function renderRuntimeFeedback(locale: "en" | "ko" | "ru" = "en") {
  const messages = getMessages(locale);
  const props = {
    messages,
    hasGlobalErrorStack: true,
    runtime: { isError: true },
    smokeStatus: { isError: false },
    recovery: { isError: false },
    providerMatrix: { isError: false },
    providerSessions: { isError: false },
    providerParserHealth: { isError: false },
    showGlobalAnalyzeDeleteError: false,
    analyzeDeleteErrorMessage: "",
    showGlobalCleanupDryRunError: false,
    cleanupDryRunErrorMessage: "",
    providerSessionActionError: false,
    providerSessionActionErrorMessage: "",
    bulkActionError: false,
    bulkActionErrorMessage: "",
    showRuntimeBackendDegraded: false,
    busy: false,
  } as unknown as RuntimeFeedbackStackProps;

  return renderToStaticMarkup(<RuntimeFeedbackStack {...props} />);
}

describe("RuntimeFeedbackStack", () => {
  it("renders localized runtime stack headings in Korean", () => {
    const html = renderRuntimeFeedback("ko");

    expect(html).toContain("runtime 문제");
    expect(html).toContain("일부 runtime 작업을 사용할 수 없습니다.");
    expect(html).toContain("runtime 상태를 불러오지 못했습니다");
    expect(html).toContain("GitHub에 제보");
    expect(html).toContain("https://github.com/hanityx/threadlens/issues/new/choose");
    expect(html).toContain("로그는 자동 전송되지 않습니다.");
  });
});
