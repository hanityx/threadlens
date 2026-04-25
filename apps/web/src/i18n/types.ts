export const SUPPORTED_LOCALES = [
  "en",
  "ko",
  "es",
  "ja",
  "de",
  "zh-CN",
  "ru",
  "pt-BR",
  "id",
  "hi",
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export type DeepStringMap<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringMap<T[K]>;
};
