import { i18n } from '@/i18n';
import { getFormatLocale } from '@/i18n/locale';

import { currencySymbols, getDisplayCurrency, type Currency } from './currency';

const formatters = new Map<string, Intl.NumberFormat>();

/** Number formatter for the app's locale, built once per locale and options. */
function numberFormat(options: Intl.NumberFormatOptions) {
  const locale = getFormatLocale();
  const key = `${locale} ${JSON.stringify(options)}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    formatters.set(key, formatter);
  }
  return formatter;
}

const cents: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

/**
 * `number` with the currency's symbol where the locale puts one: "RD$1,234.56",
 * or "1.234,56 RD$" where it goes last. The symbol itself is always RD$ or
 * US$, which `Intl` only prints for es-DO (en-US gives "$" and "DOP").
 */
function withSymbol(number: string, currency: Currency) {
  const template = numberFormat({
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(0);
  return template.replace(/[^\d\s]+/, currencySymbols[currency]).replace('0', number);
}

/** "RD$1,234.56" or "-US$12.00": in the display currency unless another is given. */
export function formatCurrency(amount: number, currency: Currency = getDisplayCurrency()) {
  const formatted = withSymbol(numberFormat(cents).format(Math.abs(amount)), currency);
  return amount < 0 ? `-${formatted}` : formatted;
}

/** Whole amounts without cents, for headline totals and round figures: RD$120,431, US$100. */
export function formatWholeCurrency(amount: number, currency: Currency = getDisplayCurrency()) {
  const formatted = withSymbol(numberFormat({ maximumFractionDigits: 0 }).format(Math.abs(amount)), currency);
  return amount <= -0.5 ? `-${formatted}` : formatted;
}

/** Like formatCurrency, with a leading "+" for gains. */
export function formatSignedCurrency(amount: number, currency?: Currency) {
  return amount > 0 ? `+${formatCurrency(amount, currency)}` : formatCurrency(amount, currency);
}

/** Short amounts for chart axes: RD$660K, US$1.25M, RD$500 (RD$660 k in Spanish). */
export function formatCompactCurrency(
  amount: number,
  maximumFractionDigits = 2,
  currency: Currency = getDisplayCurrency(),
) {
  const value = Math.abs(amount);
  const unit = value >= 1_000_000 ? 'millions' : value >= 1_000 ? 'thousands' : null;
  const scaled = unit === 'millions' ? value / 1_000_000 : unit === 'thousands' ? value / 1_000 : value;
  const digits = numberFormat({ maximumFractionDigits }).format(scaled);
  const short = unit ? i18n.t(`format.${unit}`, { value: digits }) : digits;
  const formatted = withSymbol(short, currency);
  return amount < 0 ? `-${formatted}` : formatted;
}

export function formatPercent(ratio: number, fractionDigits = 1) {
  return numberFormat({
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(ratio);
}

/** Counts and other plain numbers with the locale's grouping: 1,234 (1.234 in some locales). */
export function formatNumber(value: number, options: Intl.NumberFormatOptions = {}) {
  return numberFormat(options).format(value);
}

/** "." or ",": what separates the cents when the user types an amount. */
export function decimalSeparator() {
  return formatNumber(1.5, { minimumFractionDigits: 1 }).replace(/\d/g, '');
}

/** Non-breaking spaces keep a short phrase whole, like "Installment 3 of 7": a line only wraps around it. */
export const keepTogether = (text: string) => text.replace(/ /g, '\u00A0');

/** " · " between parts of a line: when it wraps, the dot ends a line instead of starting the next. */
export const dotSeparator = '\u00A0· ';
