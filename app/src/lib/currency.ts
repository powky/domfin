/**
 * Currencies in Domfin. Every account, transaction and loan has one; totals
 * and charts that mix them are shown in the display currency the user picks.
 */
export type Currency = 'DOP' | 'USD';

export const CURRENCIES: readonly Currency[] = ['DOP', 'USD'];

/**
 * Written as in the Dominican Republic. `Intl` only prints these for es-DO
 * (en-US gives "$" and "DOP"), so formatters add them themselves.
 */
export const currencySymbols: Record<Currency, string> = { DOP: 'RD$', USD: 'US$' };

/** Adds amounts to the cent, without floating-point drift. */
export const sumCents = (values: readonly number[]) => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;

/** `amount` in `from`, expressed in `to` at `pesosPerDollar`. Not rounded. */
export function convert(amount: number, from: Currency, to: Currency, pesosPerDollar: number) {
  if (from === to) return amount;
  return from === 'USD' ? amount * pesosPerDollar : amount / pesosPerDollar;
}

// Display currency: a small store so plain formatters can read it and
// hooks can subscribe to it (see `useDisplayCurrency`).
let displayCurrency: Currency = 'DOP';
const listeners = new Set<() => void>();

export const getDisplayCurrency = () => displayCurrency;

export function setDisplayCurrency(currency: Currency) {
  if (currency === displayCurrency) return;
  displayCurrency = currency;
  listeners.forEach((listener) => listener());
}

export function subscribeDisplayCurrency(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
