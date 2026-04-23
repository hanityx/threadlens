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
import { withCanonicalEnglish } from "@/i18n/canonicalEnglish";
import { resolveSupportedLocale } from "@/i18n/locales";
import type { Locale } from "@/i18n/types";
export type { Messages } from "@/i18n/en";
const ENGLISH_MESSAGES = en;

export { CANONICAL_ENGLISH_PATHS } from "@/i18n/canonicalEnglish";

const runtimeMessagesCache = new Map<Locale, Messages>([["en", ENGLISH_MESSAGES]]);

const RUNTIME_MESSAGE_LOADERS: Record<Locale, () => Promise<Messages>> = {
  en: async () => ENGLISH_MESSAGES,
  ko: async () => withCanonicalEnglish((await import("@/i18n/ko")).ko),
  ja: async () => withCanonicalEnglish((await import("@/i18n/ja")).ja),
  "zh-CN": async () => withCanonicalEnglish((await import("@/i18n/zh-CN")).zhCN),
  "pt-BR": async () => withCanonicalEnglish((await import("@/i18n/pt-BR")).ptBR),
  es: async () => withCanonicalEnglish((await import("@/i18n/es")).es),
  hi: async () => withCanonicalEnglish((await import("@/i18n/hi")).hi),
  de: async () => withCanonicalEnglish((await import("@/i18n/de")).de),
  id: async () => withCanonicalEnglish((await import("@/i18n/id")).id),
  ru: async () => withCanonicalEnglish((await import("@/i18n/ru")).ru),
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

export async function loadMessages(rawLocale: string | null | undefined): Promise<Messages> {
  const locale = resolveSupportedLocale(rawLocale) ?? "en";
  const cached = runtimeMessagesCache.get(locale);
  if (cached) return cached;
  const next = await RUNTIME_MESSAGE_LOADERS[locale]();
  runtimeMessagesCache.set(locale, next);
  return next;
}

export function LocaleProvider({
  children,
  initialLocale,
  initialMessages,
}: {
  children: ReactNode;
  initialLocale?: Locale;
  initialMessages?: Messages;
}) {
  const [locale, setLocale] = useState<Locale>(() => {
    if (initialLocale) return initialLocale;
    if (typeof window === "undefined") return "en";
    return detectPreferredLocale({
      savedLocale: readSavedLocale(),
      browserLanguage: window.navigator?.language ?? null,
    });
  });
  const [messages, setMessages] = useState<Messages>(() => initialMessages ?? ENGLISH_MESSAGES);

  useEffect(() => {
    if (typeof window === "undefined") return;
    document.documentElement.lang = locale;
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // ignore persistence failures
    }
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    void loadMessages(locale).then((nextMessages) => {
      if (cancelled) return;
      setMessages((current) => (current === nextMessages ? current : nextMessages));
    });
    return () => {
      cancelled = true;
    };
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
