import { SUPPORTED_LOCALES, type Locale } from "@/i18n/types";

export { SUPPORTED_LOCALES } from "@/i18n/types";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ko: "한국어",
  es: "Español",
  ja: "日本語",
  de: "Deutsch",
  "zh-CN": "简体中文",
  ru: "Русский",
  "pt-BR": "Português (Brasil)",
  id: "Bahasa Indonesia",
  hi: "हिन्दी",
};

export const LOCALE_SHORT_LABELS: Record<Locale, string> = {
  en: "EN",
  ko: "KO",
  es: "ES",
  ja: "JA",
  de: "DE",
  "zh-CN": "ZH",
  ru: "RU",
  "pt-BR": "PT",
  id: "ID",
  hi: "HI",
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
