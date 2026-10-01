import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { CURRENCIES, setDisplayCurrency, type Currency } from '@/lib/currency';

const STORAGE_KEY = 'domfin.displayCurrency';

const isCurrency = (value: unknown): value is Currency => CURRENCIES.includes(value as Currency);

// Read once at startup, before the first screen renders (see useDisplayCurrencyReady).
const loading = AsyncStorage.getItem(STORAGE_KEY)
  .then((saved) => {
    if (isCurrency(saved)) setDisplayCurrency(saved);
  })
  .catch(() => undefined);

/** Saves the choice on this device and shows totals in it. */
export function chooseDisplayCurrency(currency: Currency) {
  AsyncStorage.setItem(STORAGE_KEY, currency).catch(() => undefined);
  setDisplayCurrency(currency);
}

/** False until the saved currency is applied, so totals never flash in the other one. */
export function useDisplayCurrencyReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    loading.then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  return ready;
}
