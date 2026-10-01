import { getLocales } from 'expo-localization';

export const LANGUAGES = ['en', 'es'] as const;

export type Language = (typeof LANGUAGES)[number];

/** Each language is always listed by its own name. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  es: 'Español',
};

/** Region for number and date formats when the device reports none (common on the web). */
const DEFAULT_REGION: Record<Language, string> = {
  en: 'US',
  es: 'DO',
};

export const isLanguage = (value: unknown): value is Language => LANGUAGES.includes(value as Language);

/** The first of the device's preferred languages that the app speaks, or English. */
export function systemLanguage(): Language {
  for (const locale of getLocales()) {
    if (isLanguage(locale.languageCode)) return locale.languageCode;
  }
  return 'en';
}

let formatLocale = `en-${DEFAULT_REGION.en}`;

/**
 * Pairs the app language with the device's region ("es" on a US device
 * formats as es-US), so amounts and dates read as they do in that language
 * where the user lives.
 */
export function updateFormatLocale(language: Language) {
  formatLocale = `${language}-${getLocales()[0]?.regionCode ?? DEFAULT_REGION[language]}`;
}

/** BCP 47 tag for `Intl` and `toLocaleString`. */
export const getFormatLocale = () => formatLocale;
