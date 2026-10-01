/**
 * Another language's version of the English dictionary: the same keys with
 * its own wording, plus the `_many` plural form Spanish uses for round
 * millions.
 */
export type Translation<T> = {
  [K in keyof T]: T[K] extends string ? string : Translation<T[K]>;
} & { [key: `${string}_many`]: string };

/** The plural forms i18next looks up for Spanish, where `many` reads like `other`. */
export const plural = <K extends string>(key: K, one: string, other: string) =>
  ({ [`${key}_one`]: one, [`${key}_other`]: other, [`${key}_many`]: other }) as Record<
    `${K}_one` | `${K}_other` | `${K}_many`,
    string
  >;
