import { useEffect, useSyncExternalStore } from 'react';

import { LEDGER_MONTHS } from '@/lib/period';
import { apiGet } from '@/services/api/client';

import type { LedgerAccount, LedgerCategory, LedgerGroup, LedgerMovement, LedgerState } from '../types';

const FROM = `${LEDGER_MONTHS[0]}-01`;

/** "2026-09" → "2026-09-30". */
function monthEnd(month: string) {
  const [year, number] = month.split('-').map(Number);
  return `${month}-${String(new Date(year, number, 0).getDate()).padStart(2, '0')}`;
}

const TO = monthEnd(LEDGER_MONTHS[LEDGER_MONTHS.length - 1]);

let state: LedgerState = { status: 'loading', accounts: [], movements: [], hidden: [], groups: [], categories: [] };
let request: Promise<void> | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => state;

function set(next: LedgerState) {
  state = next;
  listeners.forEach((listener) => listener());
}

/** Keeps the hidden movements apart: every screen leaves them out. */
function split(movements: readonly LedgerMovement[]) {
  return { movements: movements.filter((m) => !m.hidden), hidden: movements.filter((m) => m.hidden) };
}

/**
 * Changes movements on this device right away, before domfin-api answers
 * (the ledger is asked for again after), so the lists don't wait for it.
 */
export function patchMovements(ids: ReadonlySet<string>, patch: Partial<Pick<LedgerMovement, 'review' | 'hidden'>>) {
  const all = [...state.movements, ...state.hidden]
    .map((movement) => (ids.has(movement.id) ? { ...movement, ...patch } : movement))
    .sort((a, b) => b.date.localeCompare(a.date));
  set({ ...state, ...split(all) });
}

/** Asks domfin-api for the ledger again, e.g. after importing statements. */
export function refreshLedger(): Promise<void> {
  request ??= Promise.all([
    apiGet<{ accounts: LedgerAccount[]; movements: LedgerMovement[] }>(`/ledger/movements?from=${FROM}&to=${TO}`),
    apiGet<{ groups: LedgerGroup[]; categories: LedgerCategory[] }>('/ledger/categories'),
  ])
    .then(([{ accounts, movements }, { groups, categories }]) =>
      set({ status: 'ready', accounts, ...split(movements), groups, categories }),
    )
    .catch(() => set({ ...state, status: 'offline' }))
    .finally(() => {
      request = null;
    });
  return request;
}

/**
 * Every account and classified movement of the months screens show, from
 * domfin-api's ledger, fetched once and shared by every screen. Hidden
 * movements come apart, in `hidden`.
 */
export function useLedger(): LedgerState {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    if (current.status !== 'ready') void refreshLedger();
  }, [current.status]);
  return current;
}
