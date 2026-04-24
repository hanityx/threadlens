export const SUPPORTED_LOCALES = [
  "en",
  "ko",
  "zh-CN",
  "hi",
  "es",
  "pt-BR",
  "ru",
  "id",
  "de",
  "ja",
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export type DeepStringMap<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringMap<T[K]>;
};
