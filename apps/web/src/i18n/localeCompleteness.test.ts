import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import { CANONICAL_ENGLISH_PATHS, getMessages } from "@/i18n/catalog";
import { de } from "@/i18n/de";
import { es } from "@/i18n/es";
import { hi } from "@/i18n/hi";
import { id } from "@/i18n/id";
import { ja } from "@/i18n/ja";
import { ko } from "@/i18n/ko";
import { ptBR } from "@/i18n/pt-BR";
import { ru } from "@/i18n/ru";
import { zhCN } from "@/i18n/zh-CN";

const tokenPattern = /\{[a-zA-Z0-9_]+\}/g;

const localeFixtures = {
  de,
  es,
  hi,
  id,
  ja,
  ko,
  "pt-BR": ptBR,
  ru,
  "zh-CN": zhCN,
} as const;

const REQUIRED_TRANSLATED_PATHS = [
  "common.loading",
  "alerts.runtimeBackendDownTitle",
  "alerts.runtimeIssuesTitle",
  "alerts.updateAvailableTitle",
  "alerts.updateAvailableBody",
  "alerts.updateAvailableOpen",
  "alerts.updateAvailableDismiss",
  "search.stageBody",
  "overview.primarySummary",
  "overview.commandShellLabel",
  "overview.commandStatusLabel",
  "overview.rowsLabel",
  "overview.rowsValue",
  "overview.sizeLabel",
  "overview.activeSessionFactsLabel",
  "overview.updatedAt",
  "overview.sourceProjectTrace",
  "providers.probeAll",
  "providers.probeOk",
  "providers.probeFail",
  "providers.backupNoneYet",
] as const;

const SAME_AS_ENGLISH_OK_PATHS = new Set<string>([
  "common.no",
  "toolbar.no",
  "overview.reviewSourceTmp",
  "routing.sessionSurfaceKicker",
  "search.title",
]);

function isCanonicalEnglishPath(path: string): boolean {
  return (CANONICAL_ENGLISH_PATHS as readonly string[]).includes(path);
}

function collectLeafPaths(
  value: Record<string, unknown>,
  prefix = "",
  output: string[] = [],
): string[] {
  for (const [key, child] of Object.entries(value)) {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") {
      output.push(nextPath);
      continue;
    }
    collectLeafPaths(child as Record<string, unknown>, nextPath, output);
  }
  return output;
}

function getByPath(value: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, segment) => {
    return (acc as Record<string, unknown>)[segment];
  }, value);
}

function extractTokens(raw: string): string[] {
  return Array.from(new Set(raw.match(tokenPattern) ?? [])).sort();
}

describe("locale completeness", () => {
  const englishLeafPaths = collectLeafPaths(en).sort();

  it("keeps every locale on the same key tree as English", () => {
    for (const [locale, messages] of Object.entries(localeFixtures)) {
      expect(collectLeafPaths(messages).sort(), locale).toEqual(englishLeafPaths);
    }
  });

  it("keeps every translated leaf non-empty and token-compatible", () => {
    for (const [locale, messages] of Object.entries(localeFixtures)) {
      for (const path of englishLeafPaths) {
        const source = String(getByPath(en, path));
        const translated = String(getByPath(messages, path));
        if (source.length > 0) {
          expect(translated.length, `${locale}:${path}`).toBeGreaterThan(0);
        } else {
          expect(translated, `${locale}:${path}`).toBe(source);
        }
        expect(extractTokens(translated), `${locale}:${path}`).toEqual(extractTokens(source));
      }
    }
  });

  it("keeps canonical English glossary entries identical across locales", () => {
    for (const locale of Object.keys(localeFixtures)) {
      const resolvedMessages = getMessages(locale);
      for (const path of CANONICAL_ENGLISH_PATHS) {
        expect(getByPath(resolvedMessages, path), `${locale}:${path}`).toBe(getByPath(en, path));
      }
    }
  });

  it("keeps key user-facing status copy translated outside the canonical glossary", () => {
    for (const [locale, messages] of Object.entries(localeFixtures)) {
      for (const path of REQUIRED_TRANSLATED_PATHS) {
        expect(getByPath(messages, path), `${locale}:${path}`).not.toBe(getByPath(en, path));
      }
    }
  });
});
