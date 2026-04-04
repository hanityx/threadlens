import { SUPPORTED_LOCALES, type Locale } from "./types";

export { SUPPORTED_LOCALES } from "./types";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  "zh-CN": "简体中文",
  hi: "हिन्दी",
  es: "Español",
  "pt-BR": "Português (Brasil)",
  ru: "Русский",
  id: "Bahasa Indonesia",
  de: "Deutsch",
  ja: "日本語",
  ko: "한국어",
};

export const LOCALE_SHORT_LABELS: Record<Locale, string> = {
  en: "EN",
  "zh-CN": "ZH",
  hi: "HI",
  es: "ES",
  "pt-BR": "PT",
  ru: "RU",
  id: "ID",
  de: "DE",
  ja: "JA",
  ko: "KO",
};

export function isSupportedLocale(raw: string | null | undefined): raw is Locale {
  return SUPPORTED_LOCALES.includes(raw as Locale);
}

export function resolveSupportedLocale(raw: string | null | undefined): Locale | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (isSupportedLocale(value)) return value;

  const normalized = value.toLowerCase();
  if (normalized === "zh" || normalized === "zh-cn" || normalized === "zh-hans") {
    return "zh-CN";
  }
  if (normalized === "pt" || normalized === "pt-br" || normalized === "pt-pt") {
    return "pt-BR";
  }

  const base = normalized.split(/[-_]/)[0] ?? normalized;
  switch (base) {
    case "en":
      return "en";
    case "ko":
      return "ko";
    case "ja":
      return "ja";
    case "zh":
      return "zh-CN";
    case "pt":
      return "pt-BR";
    case "es":
      return "es";
    case "hi":
      return "hi";
    case "de":
      return "de";
    case "id":
      return "id";
    case "ru":
      return "ru";
    default:
      return null;
  }
}
