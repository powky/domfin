import type { LedgerMovement } from '../types';

/** Lowercase and without accents, like domfin-api compares texts: "NÓMINA" is "nomina". */
export const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * The days of the month payroll credits come on the most: the one or two
 * days most of them fall on, among the credits whose description has the
 * keyword (in the payroll account, when there is one).
 */
export function paydaysOf(movements: readonly LedgerMovement[], keyword: string, accountId: string): number[] {
  if (keyword === '') return [];
  const counts = new Map<number, number>();
  for (const movement of movements) {
    if (movement.amount <= 0 || (accountId !== '' && movement.accountId !== accountId)) continue;
    if (!normalize(movement.description).includes(keyword)) continue;
    const day = Number(movement.date.slice(8, 10));
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 2)
    .map(([day]) => day)
    .sort((a, b) => a - b);
}
