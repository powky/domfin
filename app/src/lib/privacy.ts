import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { currencySymbols } from './currency';

/**
 * Amounts hidden from view ("RD$1,290,201.23" shows as "RD$x,xxx,xxx.xx")
 * for when someone else can see the screen: a small store that `Text`
 * subscribes to, saved on this device.
 */
const STORAGE_KEY = 'domfin.hideAmounts';

let hidden = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

// Read once at startup, before the first screen renders (see useAmountsPreferenceReady).
const loading = AsyncStorage.getItem(STORAGE_KEY)
  .then((saved) => {
    if (saved === 'true') {
      hidden = true;
      notify();
    }
  })
  .catch(() => undefined);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getHidden = () => hidden;

/** Whether amounts are hidden; re-renders when that changes. */
export const useAmountsHidden = () => useSyncExternalStore(subscribe, getHidden, getHidden);

/** Hides or shows amounts everywhere, and remembers it on this device. */
export function setAmountsHidden(next: boolean) {
  hidden = next;
  AsyncStorage.setItem(STORAGE_KEY, String(next)).catch(() => undefined);
  notify();
}

/** False until the saved choice is applied, so hidden amounts never flash when the app opens. */
export function useAmountsPreferenceReady() {
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

const symbols = Object.values(currencySymbols)
  .map((symbol) => symbol.replace(/[$]/g, '\\$'))
  .join('|');
const space = '[ \\u00A0\\u202F]';
const number = '\\d[\\d.,\\u00A0\\u202F]*';
// An amount next to its currency's symbol, on either side: "RD$1,290,201.23",
// "-US$12.00", "RD$660 k", "1.234,56 RD$".
const amount = new RegExp(`(?:${symbols})${space}?${number}|${number}${space}?(?:${symbols})`, 'g');

/** `text` with every digit of its amounts turned into an x: "RD$1,290.23" is "RD$x,xxx.xx". */
export const hideAmounts = (text: string) => text.replace(amount, (match) => match.replace(/\d/g, 'x'));
