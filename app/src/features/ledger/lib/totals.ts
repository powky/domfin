import type { LedgerMovement } from '../types';

/**
 * Adds up movements by `keyOf` (a category, a merchant…), month by month,
 * with `valueOf` giving each one's amount in cents of a single currency;
 * totals come in units of it. Movements outside `months` are left out.
 */
export function monthlyValues(
  movements: readonly LedgerMovement[],
  months: readonly string[],
  keyOf: (movement: LedgerMovement) => string,
  valueOf: (movement: LedgerMovement) => number,
): Map<string, number[]> {
  const indexes = new Map(months.map((month, index) => [month, index]));
  const cents = new Map<string, number[]>();
  for (const movement of movements) {
    const index = indexes.get(movement.date.slice(0, 7));
    if (index === undefined) continue;
    const key = keyOf(movement);
    const monthly = cents.get(key) ?? months.map(() => 0);
    monthly[index] += valueOf(movement);
    cents.set(key, monthly);
  }
  return new Map([...cents].map(([key, monthly]) => [key, monthly.map((value) => Math.round(value) / 100)]));
}
