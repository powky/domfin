import { addMonths, formatDateValue, monthsBetween } from '@/lib/dates';

/**
 * Month-based reporting periods shared by every screen with a period picker.
 * Ranges are inclusive indices into `LEDGER_MONTHS`.
 */
export type MonthRange = { start: number; end: number };

function calendarMonths(today: Date) {
  const current = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const first = `${today.getFullYear() - 1}-01`;
  return Array.from({ length: monthsBetween(first, current) + 1 }, (_, index) => addMonths(first, index));
}

/**
 * The months screens can show, 'YYYY-MM': January of last year through this
 * month. Months without imported statements simply have no data.
 */
export const LEDGER_MONTHS: readonly string[] = calendarMonths(new Date());

export type PeriodPreset = 'ytd' | 'last6' | 'last3' | 'month';

export const LATEST_MONTH = LEDGER_MONTHS.length - 1;

/** In menu order; their names are the `period.presets` translations. */
export const periodPresets = ['ytd', 'last6', 'last3', 'month'] as const satisfies readonly PeriodPreset[];

export function rangeForPreset(preset: PeriodPreset): MonthRange {
  switch (preset) {
    case 'ytd': {
      const year = LEDGER_MONTHS[LATEST_MONTH].slice(0, 4);
      const start = LEDGER_MONTHS.findIndex((month) => month.startsWith(year));
      return { start, end: LATEST_MONTH };
    }
    case 'last6':
      return { start: Math.max(LATEST_MONTH - 5, 0), end: LATEST_MONTH };
    case 'last3':
      return { start: Math.max(LATEST_MONTH - 2, 0), end: LATEST_MONTH };
    case 'month':
      return { start: LATEST_MONTH, end: LATEST_MONTH };
  }
}

const length = (range: MonthRange) => range.end - range.start + 1;

/** Moves the range by its own length. Returns null when there is no data there. */
export function shiftRange(range: MonthRange, direction: -1 | 1): MonthRange | null {
  const offset = length(range) * direction;
  const next = { start: range.start + offset, end: range.end + offset };
  if (next.start < 0 || next.end > LATEST_MONTH) return null;
  return next;
}

const monthLabel = (key: string, style: 'short' | 'long') =>
  formatDateValue(key, style === 'long' ? { month: 'short', year: 'numeric' } : { month: 'short' });

/** "Jan – Oct 2026" within a year, "Nov 2025 – Oct 2026" across two. */
export function formatRange(range: MonthRange) {
  const start = LEDGER_MONTHS[range.start];
  const end = LEDGER_MONTHS[range.end];
  if (range.start === range.end) return monthLabel(start, 'long');
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${monthLabel(start, sameYear ? 'short' : 'long')} – ${monthLabel(end, 'long')}`;
}

export const shortMonthLabel = (key: string) => monthLabel(key, 'short');

export const monthsInRange = (range: MonthRange) => [...LEDGER_MONTHS.slice(range.start, range.end + 1)];
