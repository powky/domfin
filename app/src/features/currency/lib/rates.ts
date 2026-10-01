import type { Currency } from '@/lib/currency';

import type { Converter, ExchangeRate } from '../types';

/** Pesos per dollar the app converts at: the midpoint of compra and venta, to 4 decimals like the BCRD. */
export const midRate = (rate: ExchangeRate) => Math.round(((rate.buy + rate.sell) / 2) * 10_000) / 10_000;

const round = (value: number) => Math.round(value * 100) / 100;

/** `amount` in the display currency, to the cent. */
export const inDisplay = (converter: Converter, amount: number, from: Currency) =>
  round(converter.toDisplay(amount, from));

/** Adds up amounts in different currencies, in the display currency, to the cent. */
export function sumInDisplay(converter: Converter, amounts: readonly { amount: number; currency: Currency }[]) {
  return round(amounts.reduce((total, item) => total + converter.toDisplay(item.amount, item.currency), 0));
}

/**
 * A movement in the display currency, in the units it comes in: as
 * domfin-api valued it at the BCRD rate of its date (`amounts`), or at
 * today's rate when it has no value there (added by hand, or no rate).
 */
export const valueInDisplay = (
  converter: Converter,
  item: { amount: number; currency: Currency; amounts?: Partial<Record<Currency, number>> },
) => item.amounts?.[converter.currency] ?? converter.toDisplay(item.amount, item.currency);
