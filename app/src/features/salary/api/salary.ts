import { useEffect, useSyncExternalStore } from 'react';

import { apiGet, apiSend } from '@/services/api/client';

import type { Payslip, SalarySettings, SalarySettingsInput } from '../types';

type Status = 'loading' | 'ready' | 'offline';

/** A value from domfin-api shared by every screen: read once, refreshed when asked. */
function shared<T>(path: string, empty: T, read: (body: unknown) => T) {
  let state: { status: Status; value: T } = { status: 'loading', value: empty };
  let request: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const getSnapshot = () => state;
  const set = (next: typeof state) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const refresh = () => {
    request ??= apiGet<unknown>(path)
      .then((body) => set({ status: 'ready', value: read(body) }))
      .catch(() => set({ ...state, status: 'offline' }))
      .finally(() => {
        request = null;
      });
    return request;
  };
  const use = () => {
    const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    useEffect(() => {
      if (current.status !== 'ready') void refresh();
    }, [current.status]);
    return current;
  };
  return { refresh, use, set };
}

const payslips = shared<Payslip[]>('/ledger/payslips', [], (body) => (body as { payslips: Payslip[] }).payslips);
const settings = shared<SalarySettings>('/ledger/salary', { entries: [], extras: [] }, (body) => body as SalarySettings);

/** The imported pay stubs, oldest first. */
export const usePayslips = payslips.use;

/** Asks domfin-api for the pay stubs again, e.g. after importing some. */
export const refreshPayslips = payslips.refresh;

/** The salaries set by hand, the day the job started and the bonus's month. */
export const useSalarySettings = settings.use;

/** Asks domfin-api for them again, e.g. after restoring a backup. */
export const refreshSalarySettings = settings.refresh;

/** Saves them all, as domfin-api keeps them; the new extra payments come back with their IDs. */
export async function saveSalarySettings(next: SalarySettingsInput): Promise<SalarySettings> {
  const saved = await apiSend<SalarySettings>('PUT', '/ledger/salary', next);
  settings.set({ status: 'ready', value: saved });
  return saved;
}
