import i18n from './i18n';
import type { Language } from './locale';
import { categoryNames, groupNames } from './locales/en/categories';

type Names = Partial<Record<Language, Readonly<Record<string, string>>>>;

const categories: Names = { en: categoryNames };
const groups: Names = { en: groupNames };

/**
 * Name of a category in `language` (the app's by default). domfin-api names
 * its built-in ones in Spanish; other languages translate them by id, and a
 * category the user made keeps its name. Hooks pass the language they got
 * from `useTranslation` so their memos rebuild with it.
 */
export function categoryLabel(id: string, fallback: string, language: string = i18n.language) {
  return categories[language as Language]?.[id] ?? fallback;
}

/** Name of a category group in `language`, like `categoryLabel`. */
export function groupLabel(id: string, fallback: string, language: string = i18n.language) {
  return groups[language as Language]?.[id] ?? fallback;
}
