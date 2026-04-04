import type { Locale, TuiMessages } from "./types.js";
import { en } from "./en.js";
import { ko } from "./ko.js";
import { ja } from "./ja.js";
import { zhCN } from "./zh-CN.js";
import { ptBR } from "./pt-BR.js";
import { es } from "./es.js";
import { hi } from "./hi.js";
import { de } from "./de.js";
import { id } from "./id.js";
import { ru } from "./ru.js";

const LOCALE_MAP: Record<Locale, TuiMessages> = {
  en,
  "zh-CN": zhCN,
  hi,
  es,
  "pt-BR": ptBR,
  ru,
  id,
  de,
  ja,
  ko,
};

export function normalizeLocale(input?: string | null): Locale {
  if (!input) return "en";
  const normalized = input.toLowerCase();
  if (normalized.startsWith("ko")) return "ko";
  if (normalized.startsWith("ja")) return "ja";
  if (normalized === "zh-cn" || normalized === "zh_cn" || normalized === "zh-hans" || normalized.startsWith("zh")) {
    return "zh-CN";
  }
  if (normalized === "pt-br" || normalized === "pt_br") return "pt-BR";
  if (normalized.startsWith("es")) return "es";
  if (normalized.startsWith("hi")) return "hi";
  if (normalized.startsWith("de")) return "de";
  if (normalized.startsWith("id")) return "id";
  if (normalized.startsWith("ru")) return "ru";
  return "en";
}

export function resolveLocale(argv: string[], env: NodeJS.ProcessEnv = process.env): Locale {
  const localeIndex = argv.findIndex((token) => token === "--locale");
  if (localeIndex >= 0) {
    return normalizeLocale(argv[localeIndex + 1] ?? null);
  }
  return normalizeLocale(env.THREADLENS_LOCALE ?? null);
}

export function getMessages(locale: Locale): TuiMessages {
  return LOCALE_MAP[locale];
}
