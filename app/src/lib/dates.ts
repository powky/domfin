import { i18n } from '@/i18n';
import { getFormatLocale } from '@/i18n/locale';

/**
 * 'YYYY-MM' month keys (the ledger's unit) and the date labels shown on
 * screens, in the app's locale. Dates are parsed as local time so
 * "2026-09-01" never shifts a day.
 */

const toIndex = (key: string) => {
  const [year, month] = key.split('-').map(Number);
  return year * 12 + month - 1;
};

const fromIndex = (index: number) => `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;

export function addMonths(key: string, count: number) {
  return fromIndex(toIndex(key) + count);
}

/** Today, "YYYY-MM-DD" in local time. */
export function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Whole months from `from` to `to` (negative when `to` is earlier). */
export function monthsBetween(from: string, to: string) {
  return toIndex(to) - toIndex(from);
}

export const monthYear = (key: string) => Number(key.slice(0, 4));

function parse(value: string) {
  const [date, time] = value.split('T');
  const [year, month, day = 1] = date.split('-').map(Number);
  const [hours = 0, minutes = 0, seconds = 0] = time ? time.split(':').map(Number) : [];
  return new Date(year, month - 1, day, hours, minutes, seconds);
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Formats a date or 'YYYY-MM' key in the app's locale, reusing one formatter per locale and options. */
export function formatDateValue(value: string, options?: Intl.DateTimeFormatOptions) {
  const locale = getFormatLocale();
  const key = `${locale} ${JSON.stringify(options ?? {})}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, formatter);
  }
  return formatter.format(parse(value));
}

/** "Sep 2026" */
export const formatMonthYear = (key: string) => formatDateValue(key, { month: 'short', year: 'numeric' });

/** "September 2026" */
export const formatLongMonthYear = (key: string) => formatDateValue(key, { month: 'long', year: 'numeric' });

/** "Sep 26, 2026" */
export const formatDate = (value: string) => formatDateValue(value, { month: 'short', day: 'numeric', year: 'numeric' });

/** "Sep 26" */
export const formatShortDate = (value: string) => formatDateValue(value, { month: 'short', day: 'numeric' });

/** "12:10 PM" */
export const formatTime = (value: string) => formatDateValue(value, { hour: 'numeric', minute: '2-digit' });

/** "9/26/2026, 12:10:47 PM" */
export const formatDateTime = (value: string) =>
  formatDateValue(value, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });

/** "15 yrs 8 mos", "3 yrs", "8 mos" ("15 años y 8 meses" in Spanish) */
export function formatDuration(months: number) {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return i18n.t('duration.months', { count: rest });
  if (rest === 0) return i18n.t('duration.years', { count: years });
  return i18n.t('duration.yearsAndMonths', {
    years: i18n.t('duration.years', { count: years }),
    months: i18n.t('duration.months', { count: rest }),
  });
}
