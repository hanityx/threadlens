import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from "react";
import { en } from "./en";
import { ko } from "./ko";
import type { DeepStringMap, Locale } from "./types";

export type Messages = DeepStringMap<typeof en>;

export const LOCALE_STORAGE_KEY = "po-locale";
export const LEGACY_LOCALE_STORAGE_KEY = "cmc-locale";

const LOCALE_MAP: Record<Locale, Messages> = { en, ko };

type LocaleContextValue = {
  locale: Locale;
  messages: Messages;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function getMessages(locale: Locale): Messages {
  return LOCALE_MAP[locale] ?? LOCALE_MAP.en;
}

function normalizeLocale(value?: string | null): Locale | null {
  if (value === "en" || value === "ko") return value;
  return null;
}

export function detectPreferredLocale(options?: {
  savedLocale?: string | null;
  browserLanguage?: string | null;
}): Locale {
  const savedLocale = normalizeLocale(options?.savedLocale);
  if (savedLocale) return savedLocale;
  const browserBase = String(options?.browserLanguage ?? "").split("-")[0] ?? "";
  const browserLocale = normalizeLocale(browserBase);
  return browserLocale ?? "en";
}

function readStoredLocale(): string | null {
  if (typeof window === "undefined") return null;
  for (const key of [LOCALE_STORAGE_KEY, LEGACY_LOCALE_STORAGE_KEY]) {
    const value = window.localStorage.getItem(key);
    if (value !== null) return value;
  }
  return null;
}

function resolveInitialLocale(): Locale {
  return detectPreferredLocale({
    savedLocale: readStoredLocale(),
    browserLanguage: typeof navigator !== "undefined" ? navigator.language : undefined,
  });
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(resolveInitialLocale);

  const setLocale = (nextLocale: Locale) => {
    setLocaleState(nextLocale);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    }
  };

  const messages = useMemo(() => getMessages(locale), [locale]);
  const value = useMemo(() => ({ locale, messages, setLocale }), [locale, messages]);

  return createElement(LocaleContext.Provider, { value }, children);
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used within LocaleProvider");
  return value;
}

export type { Locale };
