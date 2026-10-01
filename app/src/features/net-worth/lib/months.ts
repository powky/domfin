import { formatLongMonthYear, formatMonthYear } from '@/lib/dates';
import { LEDGER_MONTHS, shortMonthLabel } from '@/lib/period';

const toDate = (key: string) => {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1);
};

/** Month key for a ledger index; -1 is the month before the first ledger month. */
export function monthKeyAt(index: number) {
  if (index >= 0) return LEDGER_MONTHS[index];
  const date = toDate(LEDGER_MONTHS[0]);
  date.setMonth(date.getMonth() + index);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** "September 2026" */
export const longMonthYear = (key: string) => formatLongMonthYear(key);

/** "Sep 2026" */
export const shortMonthYear = (key: string) => formatMonthYear(key);

/** Axis labels: the month, plus the year on the first point and on every January. */
export const monthAxisLabels = (keys: string[]) =>
  keys.map((key, index) => (index === 0 || key.endsWith('-01') ? shortMonthYear(key) : shortMonthLabel(key)));
