/**
 * Another language's version of the English dictionary: the same keys with
 * its own wording, plus the `_many` plural form Spanish uses for round
 * millions.
 */
export type Translation<T> = {
  [K in keyof T]: T[K] extends string ? string : Translation<T[K]>;
} & { [key: `${string}_many`]: string };

/** Some of a dictionary's texts, under the same keys: what a place says differently. */
export type Overrides<T> = {
  [K in keyof T]?: T[K] extends string ? string : Overrides<T[K]>;
};

/** A copy of the texts with the overrides in place of theirs; the texts themselves stay as they are. */
export function withOverrides<T extends object>(texts: T, overrides: Overrides<T>): T {
  return merge(texts as Texts, overrides as Texts) as T;
}

/** A dictionary, or part of one: texts by key, and more of them under a key. */
export type Texts = { [key: string]: string | Texts };

function merge(texts: Texts, overrides: Texts): Texts {
  const copy = { ...texts };
  for (const [key, override] of Object.entries(overrides)) {
    const text = copy[key];
    copy[key] = typeof override === 'string' || typeof text === 'string' ? override : merge(text, override);
  }
  return copy;
}

/** The plural forms i18next looks up for Spanish, where `many` reads like `other`. */
export const plural = <K extends string>(key: K, one: string, other: string) =>
  ({ [`${key}_one`]: one, [`${key}_other`]: other, [`${key}_many`]: other }) as Record<
    `${K}_one` | `${K}_other` | `${K}_many`,
    string
  >;
