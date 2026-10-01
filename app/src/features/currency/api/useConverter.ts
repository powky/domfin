import { useMemo, useSyncExternalStore } from 'react';

import {
  convert,
  getDisplayCurrency,
  subscribeDisplayCurrency,
  type Currency,
} from '@/lib/currency';

import { midRate } from '../lib/rates';
import type { Converter } from '../types';
import { useExchangeRate } from './useExchangeRate';

/** The currency totals and charts are shown in. */
export function useDisplayCurrency(): Currency {
  return useSyncExternalStore(subscribeDisplayCurrency, getDisplayCurrency, getDisplayCurrency);
}

/**
 * Converts to the display currency at the midpoint of the BCRD rate. A new
 * converter comes with every change of currency or rate, so data hooks can
 * list it as a dependency.
 */
export function useConverter(): Converter {
  const currency = useDisplayCurrency();
  const { rate } = useExchangeRate();
  return useMemo(() => {
    const pesosPerDollar = midRate(rate);
    return {
      currency,
      pesosPerDollar,
      toDisplay: (amount: number, from: Currency) => convert(amount, from, currency, pesosPerDollar),
    };
  }, [currency, rate]);
}
