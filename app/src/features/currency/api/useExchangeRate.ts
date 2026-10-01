import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

import { apiGet } from '@/services/api/client';

import type { ExchangeRate, ExchangeRateState } from '../types';

/** Body of domfin-api's GET /rates/usd-dop. */
type RateResponse = ExchangeRate & {
  base: 'USD';
  quote: 'DOP';
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  stale: boolean;
};

/** Last BCRD rate known when this was written: used until domfin-api answers, or if it never has on this device. */
export const BUNDLED_RATE: ExchangeRate = { date: '2026-09-28', buy: 59.2669, sell: 59.5577 };

/** domfin-api caches the BCRD rate for the day; asking it hourly is plenty. */
const REFRESH_MS = 60 * 60 * 1000;
/** When domfin-api didn't answer, the next screen that needs the rate asks again after a minute. */
const RETRY_MS = 60 * 1000;

/** domfin-api's last answer, kept on the device so it is still the last rate known after a restart. */
const STORAGE_KEY = 'domfin.exchangeRate';

let state: ExchangeRateState = { rate: BUNDLED_RATE, status: 'loading' };
let request: Promise<void> | null = null;
let loadedAt = 0;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => state;

function set(next: ExchangeRateState) {
  state = next;
  listeners.forEach((listener) => listener());
}

/** The saved answer, or null if there is none or it doesn't look like a rate. */
function parseSaved(saved: string | null): Pick<ExchangeRateState, 'rate' | 'fetchedAt'> | null {
  if (!saved) return null;
  try {
    const value = JSON.parse(saved) as Partial<ExchangeRate & { fetchedAt: string }>;
    if (
      typeof value.date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
      typeof value.buy !== 'number' ||
      typeof value.sell !== 'number'
    ) {
      return null;
    }
    const fetchedAt = typeof value.fetchedAt === 'string' ? value.fetchedAt : undefined;
    return { rate: { date: value.date, buy: value.buy, sell: value.sell }, fetchedAt };
  } catch {
    return null;
  }
}

// Read once at startup. It stands in for the bundled rate while domfin-api
// hasn't answered or can't, as long as it is newer.
AsyncStorage.getItem(STORAGE_KEY)
  .then((stored) => {
    const saved = parseSaved(stored);
    const answered = state.status === 'live' || state.status === 'stale';
    if (saved && !answered && saved.rate.date > state.rate.date) set({ ...state, ...saved });
  })
  .catch(() => undefined);

/** Asks domfin-api for the rate; on failure keeps the last one known. */
export function refreshExchangeRate(): Promise<void> {
  request ??= apiGet<RateResponse>('/rates/usd-dop')
    .then(({ date, buy, sell, stale, fetchedAt }) => {
      const rate = { date, buy, sell };
      set({ rate, status: stale ? 'stale' : 'live', fetchedAt });
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...rate, fetchedAt })).catch(() => undefined);
    })
    .catch(() => {
      set({ ...state, status: 'offline' });
    })
    .finally(() => {
      request = null;
      loadedAt = Date.now();
    });
  return request;
}

/** The USD/DOP rate, fetched on first use and refreshed hourly (every minute while domfin-api is down). */
export function useExchangeRate(): ExchangeRateState {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    const wait = state.status === 'offline' ? RETRY_MS : REFRESH_MS;
    if (Date.now() - loadedAt > wait) void refreshExchangeRate();
  }, []);
  return current;
}
