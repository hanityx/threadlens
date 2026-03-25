import { createContext, createElement, useContext, type ReactNode } from "react";
import { en } from "./en";
import type { DeepStringMap, Locale } from "./types";

export type Messages = DeepStringMap<typeof en>;
const ENGLISH_MESSAGES = en;

type LocaleContextValue = {
  locale: Locale;
  messages: Messages;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function getMessages(_locale: Locale): Messages {
  return ENGLISH_MESSAGES;
}

export function detectPreferredLocale(options?: {
  savedLocale?: string | null;
  browserLanguage?: string | null;
}): Locale {
  void options;
  // Locale detection is paused while ThreadLens ships in English-only mode.
  return "en";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const setLocale = (_nextLocale: Locale) => {
    // Keep the provider contract stable for now, but disable language switching.
  };
  const value = {
    locale: "en" as Locale,
    messages: ENGLISH_MESSAGES,
    setLocale,
  };

  return createElement(LocaleContext.Provider, { value }, children);
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used within LocaleProvider");
  return value;
}

export type { Locale };
