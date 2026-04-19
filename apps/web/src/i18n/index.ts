import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  LEGACY_LOCALE_STORAGE_KEY,
  LOCALE_STORAGE_KEY,
} from "@/shared/lib/appState";
import { en, type Messages } from "@/i18n/en";
import { de } from "@/i18n/de";
import { es } from "@/i18n/es";
import { hi } from "@/i18n/hi";
import { id } from "@/i18n/id";
import { ja } from "@/i18n/ja";
import { ko } from "@/i18n/ko";
import { ptBR } from "@/i18n/pt-BR";
import { ru } from "@/i18n/ru";
import { zhCN } from "@/i18n/zh-CN";
import { resolveSupportedLocale } from "@/i18n/locales";
import type { Locale } from "@/i18n/types";
export type { Messages } from "@/i18n/en";
const ENGLISH_MESSAGES = en;
export const CANONICAL_ENGLISH_PATHS = [
  "nav.overview",
  "nav.search",
  "nav.threads",
  "nav.providers",
  "nav.forensics",
  "nav.routing",
  "nav.light",
  "nav.dark",
  "hero.title",
  "setup.title",
  "overview.openSetup",
  "overview.closeSetup",
  "overview.openThreads",
  "overview.openSessions",
  "common.allAi",
  "common.ok",
  "common.fail",
  "search.allProviders",
  "overview.readyLabel",
  "overview.failLabel",
  "overview.commandPathSessions",
  "overview.commandPathActive",
  "providers.hubTitle",
  "providers.backupHubTitle",
  "providers.advancedTitle",
  "threadsTable.title",
  "threadsTable.heroTitle",
  "threadsTable.workflowSelectedTitle",
  "threadsTable.workflowImpactTitle",
  "threadsTable.workflowDryRunTitle",
  "forensics.title",
  "forensics.stageReady",
  "forensics.stagePending",
  "threadDetail.title",
  "sessionDetail.title",
] as const;

function getByPath(value: Record<string, unknown>, path: string): string {
  return path.split(".").reduce<unknown>((acc, segment) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[segment];
  }, value) as string;
}

function setByPath(value: Record<string, unknown>, path: string, nextValue: string) {
  const parts = path.split(".");
  const last = parts.pop();
  if (!last) return;
  const parent = parts.reduce<Record<string, unknown> | null>((acc, segment) => {
    if (!acc) return null;
    const next = acc[segment];
    return next && typeof next === "object" ? (next as Record<string, unknown>) : null;
  }, value);
  if (!parent) return;
  parent[last] = nextValue;
}

function withCanonicalEnglish(messages: Messages): Messages {
  if (messages === ENGLISH_MESSAGES) return ENGLISH_MESSAGES;
  const next = JSON.parse(JSON.stringify(messages)) as Messages;
  for (const path of CANONICAL_ENGLISH_PATHS) {
    setByPath(next, path, getByPath(ENGLISH_MESSAGES, path));
  }
  return next;
}

const MESSAGES_BY_LOCALE: Record<Locale, Messages> = {
  en: ENGLISH_MESSAGES,
  ko: withCanonicalEnglish(ko),
  ja: withCanonicalEnglish(ja),
  "zh-CN": withCanonicalEnglish(zhCN),
  "pt-BR": withCanonicalEnglish(ptBR),
  es: withCanonicalEnglish(es),
  hi: withCanonicalEnglish(hi),
  de: withCanonicalEnglish(de),
  id: withCanonicalEnglish(id),
  ru: withCanonicalEnglish(ru),
};

type LocaleContextValue = {
  locale: Locale;
  messages: Messages;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readSavedLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  try {
    return resolveSupportedLocale(
      window.localStorage.getItem(LOCALE_STORAGE_KEY) ??
        window.localStorage.getItem(LEGACY_LOCALE_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

export function getMessages(rawLocale: string | null | undefined): Messages {
  const locale = resolveSupportedLocale(rawLocale) ?? "en";
  return MESSAGES_BY_LOCALE[locale] ?? ENGLISH_MESSAGES;
}

export function detectPreferredLocale(options?: {
  savedLocale?: string | null;
  browserLanguage?: string | null;
}): Locale {
  return (
    resolveSupportedLocale(options?.savedLocale) ??
    resolveSupportedLocale(options?.browserLanguage) ??
    "en"
  );
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window === "undefined") return "en";
    return detectPreferredLocale({
      savedLocale: readSavedLocale(),
      browserLanguage: window.navigator?.language ?? null,
    });
  });
  const messages = useMemo(() => getMessages(locale), [locale]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // ignore persistence failures
    }
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      messages,
      setLocale,
    }),
    [locale, messages],
  );

  return createElement(LocaleContext.Provider, { value }, children);
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used within LocaleProvider");
  return value;
}

export type { Locale };
