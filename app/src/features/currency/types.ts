import type { Currency } from '@/lib/currency';

export type { Currency } from '@/lib/currency';

/** Reference rate of the US dollar published by the BCRD, in pesos per dollar. */
export type ExchangeRate = {
  /** Business day the rate is for, 'YYYY-MM-DD'. */
  date: string;
  /** Compra: pesos the market pays for a dollar. */
  buy: number;
  /** Venta: pesos the market charges for a dollar. */
  sell: number;
};

/**
 * Where the rate in use comes from. `loading` and `offline` use the last
 * rate known (bundled with the app, or the last one domfin-api gave this
 * device, which is saved on it); `stale` is the last rate domfin-api cached
 * because it could not reach the BCRD.
 */
export type RateStatus = 'loading' | 'live' | 'stale' | 'offline';

export type ExchangeRateState = {
  rate: ExchangeRate;
  status: RateStatus;
  /** When domfin-api last got the rate from the BCRD (ISO). */
  fetchedAt?: string;
};

/** Converts amounts to the display currency. */
export type Converter = {
  /** The display currency. */
  currency: Currency;
  /** Pesos per dollar used: the midpoint of the buy and sell rates. */
  pesosPerDollar: number;
  /** `amount` in `from`, in the display currency. Not rounded. */
  toDisplay: (amount: number, from: Currency) => number;
};
