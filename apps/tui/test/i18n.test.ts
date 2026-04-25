import test from "node:test";
import assert from "node:assert/strict";
import { getMessages, resolveLocale } from "../src/i18n/index.js";
import { formatDateLabel } from "../src/lib/format.js";
import { buildUpdateNoticeLine, buildUpdateNoticeSummary } from "../src/lib/updateNotice.js";

test("resolveLocale prefers explicit --locale over env", () => {
  assert.equal(resolveLocale(["--locale", "es"], { THREADLENS_LOCALE: "en" }), "es");
});

test("resolveLocale falls back to env and defaults to en", () => {
  assert.equal(resolveLocale([], { THREADLENS_LOCALE: "ko-KR" }), "ko");
  assert.equal(resolveLocale([], { THREADLENS_LOCALE: "ja-JP" }), "ja");
  assert.equal(resolveLocale([], { THREADLENS_LOCALE: "zh-CN" }), "zh-CN");
  assert.equal(resolveLocale([], { THREADLENS_LOCALE: "pt-BR" }), "pt-BR");
  assert.equal(resolveLocale([], { THREADLENS_LOCALE: "es-ES" }), "es");
  assert.equal(resolveLocale([], { THREADLENS_LOCALE: "hi-IN" }), "hi");
  assert.equal(resolveLocale([], { THREADLENS_LOCALE: "de-DE" }), "de");
  assert.equal(resolveLocale([], { THREADLENS_LOCALE: "id-ID" }), "id");
  assert.equal(resolveLocale([], { THREADLENS_LOCALE: "ru-RU" }), "ru");
  assert.equal(resolveLocale([], {}), "en");
  assert.equal(resolveLocale(["--locale", "fr"], {}), "en");
});

test("resolveLocale falls back to standard locale env vars", () => {
  assert.equal(resolveLocale([], { LC_ALL: "de_DE.UTF-8" }), "de");
  assert.equal(resolveLocale([], { LANGUAGE: "ja_JP.UTF-8:en_US.UTF-8" }), "ja");
  assert.equal(resolveLocale([], { LANG: "ko_KR.UTF-8" }), "ko");
  assert.equal(resolveLocale([], { LANG: "pt_BR.UTF-8" }), "pt-BR");
  assert.equal(resolveLocale([], { LC_ALL: "C.UTF-8", LANG: "ko_KR.UTF-8" }), "ko");
});

test("getMessages returns localized copy for representative non-English locales", () => {
  assert.equal(getMessages("ja").common.detail, "詳細");
  assert.equal(getMessages("es").common.detail, "Detalle");
  assert.equal(getMessages("ru").common.detail, "Подробности");
});

test("getMessages resolves non-English locale bundles", () => {
  assert.equal(getMessages("ja").common.detail.length > 0, true);
  assert.equal(getMessages("zh-CN").common.detail.length > 0, true);
  assert.equal(getMessages("pt-BR").common.detail.length > 0, true);
  assert.equal(getMessages("es").common.detail.length > 0, true);
  assert.equal(getMessages("hi").common.detail.length > 0, true);
  assert.equal(getMessages("de").common.detail.length > 0, true);
  assert.equal(getMessages("id").common.detail.length > 0, true);
  assert.equal(getMessages("ru").common.detail.length > 0, true);
});

test("keeps core workflow terms stable in TUI help copy across locales", () => {
  for (const locale of ["ko", "ja", "zh-CN", "pt-BR", "es", "hi", "de", "id", "ru"] as const) {
    const messages = getMessages(locale);
    assert.match(messages.app.helpTitle, /^ThreadLens TUI/);
    assert.match(messages.app.helpGlobalBody, /1 Search  2 Sessions  3 Cleanup/);
  }
});

test("locale copy polish keeps representative non-ko strings natural", () => {
  assert.equal(getMessages("ru").search.selectResult, "Выберите результат.");
  assert.equal(getMessages("ru").cleanup.selectThread, "Выберите поток.");
  assert.match(getMessages("es").app.helpSearchBodyLine1, /^\s+Escribe la búsqueda/);
  assert.match(getMessages("pt-BR").app.helpSearchBodyLine1, /^\s+Digite a busca/);
  assert.match(getMessages("id").app.helpSearchBodyLine1, /^\s+Ketik pencarian/);
  assert.equal(getMessages("es").sessions.actionDeleteExecute, "D ejecutar delete");
});

test("korean copy avoids casual imperative endings in core prompts", () => {
  const ko = getMessages("ko");
  assert.equal(ko.search.selectResult, "결과를 선택하세요.");
  assert.equal(ko.sessions.selectSession, "세션을 선택하세요.");
  assert.equal(ko.cleanup.selectThread, "스레드를 선택하세요.");
  assert.match(ko.cli.ttyRequired, /다시 실행하세요\.$/);
});

test("formatDateLabel respects locale", () => {
  const iso = "2026-04-02T15:04:00.000Z";
  const ko = formatDateLabel(iso, "ko");
  const en = formatDateLabel(iso, "en");

  assert.notEqual(ko, en);
  assert.match(ko, /\d/);
  assert.match(en, /\d/);
});

test("buildUpdateNoticeLine uses localized copy when messages are provided", () => {
  const line = buildUpdateNoticeLine(
    {
      checked_at: "2026-04-02T00:00:00.000Z",
      current_version: "0.1.0",
      latest_version: "0.1.1",
      release_title: "ThreadLens v0.1.1",
      release_summary: null,
      has_update: true,
      release_url: "https://example.com/release",
      source: "github-releases",
      status: "available",
      error: null,
    },
    getMessages("es"),
  );

  assert.equal(line, "Actualización disponible: v0.1.1 · actual v0.1.0");
});

test("buildUpdateNoticeSummary uses localized fallback for non-English locales", () => {
  const update = {
    checked_at: "2026-04-02T00:00:00.000Z",
    current_version: "0.1.0",
    latest_version: "0.1.1",
    release_title: "ThreadLens v0.1.1",
    release_summary: "ThreadLens is a local-first workbench for AI conversation search.",
    has_update: true,
    release_url: "https://example.com/release",
    source: "github-releases",
    status: "available" as const,
    error: null,
  };

  assert.equal(
    buildUpdateNoticeSummary(update, getMessages("es"), "es"),
    "Abre las notas de la versión para revisar lo nuevo de esta actualización.",
  );
  assert.equal(
    buildUpdateNoticeSummary(update, getMessages("en"), "en"),
    "ThreadLens is a local-first workbench for AI conversation search.",
  );
});
