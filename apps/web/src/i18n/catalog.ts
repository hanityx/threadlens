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
import { withCanonicalEnglish } from "@/i18n/canonicalEnglish";
export { CANONICAL_ENGLISH_PATHS } from "@/i18n/canonicalEnglish";
import { resolveSupportedLocale } from "@/i18n/locales";
import type { Locale } from "@/i18n/types";

const ENGLISH_MESSAGES = en;

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

export function getMessages(rawLocale: string | null | undefined): Messages {
  const locale = resolveSupportedLocale(rawLocale) ?? "en";
  return MESSAGES_BY_LOCALE[locale] ?? ENGLISH_MESSAGES;
}
