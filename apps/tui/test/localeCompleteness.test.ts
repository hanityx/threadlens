import test from "node:test";
import assert from "node:assert/strict";
import { en } from "../src/i18n/en.js";
import { ko } from "../src/i18n/ko.js";
import { ja } from "../src/i18n/ja.js";
import { zhCN } from "../src/i18n/zh-CN.js";
import { ptBR } from "../src/i18n/pt-BR.js";
import { es } from "../src/i18n/es.js";
import { hi } from "../src/i18n/hi.js";
import { de } from "../src/i18n/de.js";
import { id } from "../src/i18n/id.js";
import { ru } from "../src/i18n/ru.js";

const tokenPattern = /\{[a-zA-Z0-9_]+\}/g;

const localeFixtures = {
  ko,
  ja,
  "zh-CN": zhCN,
  "pt-BR": ptBR,
  es,
  hi,
  de,
  id,
  ru,
} as const;

const CANONICAL_ENGLISH_PATHS = ["cli.helpTitle"] as const;

const REQUIRED_TRANSLATED_PATHS = [
  "common.loading",
  "search.enterAtLeastTwoCharacters",
  "search.selectResult",
  "sessions.noSessionsFound",
  "sessions.selectSession",
  "cleanup.noThreadsFound",
  "cleanup.selectThread",
] as const;

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
    if (typeof child === "function") {
      output.push(nextPath);
      continue;
    }
    collectLeafPaths(child as Record<string, unknown>, nextPath, output);
  }
  return output;
}

function getByPath(value: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, segment) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[segment];
  }, value);
}

function materialize(path: string, value: unknown): string {
  if (typeof value === "function") {
    if (path.endsWith("tagsLabel")) {
      return value(["{a}", "{b}"]);
    }
    return value("{a}", "{b}", "{c}");
  }
  return String(value ?? "");
}

function extractTokens(raw: string): string[] {
  return Array.from(new Set(raw.match(tokenPattern) ?? [])).sort();
}

test("tui locales keep the same key tree as English", () => {
  const englishLeafPaths = collectLeafPaths(en).sort();

  for (const [locale, messages] of Object.entries(localeFixtures)) {
    assert.deepEqual(collectLeafPaths(messages).sort(), englishLeafPaths, locale);
  }
});

test("tui locales keep every leaf non-empty and token-compatible", () => {
  const englishLeafPaths = collectLeafPaths(en).sort();

  for (const [locale, messages] of Object.entries(localeFixtures)) {
    for (const path of englishLeafPaths) {
      const source = materialize(path, getByPath(en, path));
      const translated = materialize(path, getByPath(messages, path));
      if (source.length > 0) {
        assert.equal(translated.length > 0, true, `${locale}:${path}`);
      } else {
        assert.equal(translated, source, `${locale}:${path}`);
      }
      assert.deepEqual(extractTokens(translated), extractTokens(source), `${locale}:${path}`);
    }
  }
});

test("tui locales keep canonical English terms stable", () => {
  for (const [locale, messages] of Object.entries(localeFixtures)) {
    for (const path of CANONICAL_ENGLISH_PATHS) {
      assert.equal(materialize(path, getByPath(messages, path)), materialize(path, getByPath(en, path)), `${locale}:${path}`);
    }
  }
});

test("tui locales translate key user-facing copy outside canonical English", () => {
  for (const [locale, messages] of Object.entries(localeFixtures)) {
    for (const path of REQUIRED_TRANSLATED_PATHS) {
      assert.notEqual(materialize(path, getByPath(messages, path)), materialize(path, getByPath(en, path)), `${locale}:${path}`);
    }
  }
});
