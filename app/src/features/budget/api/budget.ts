import { useEffect, useSyncExternalStore } from 'react';

import { apiGet, apiSend } from '@/services/api/client';

import type { Budget, BudgetInput, FixedCost, FixedCostInput, Money } from '../types';

type BudgetState = { status: 'loading' | 'ready' | 'offline'; budget: Budget };

const EMPTY: Budget = { items: [], dismissed: [] };

let state: BudgetState = { status: 'loading', budget: EMPTY };
let request: Promise<void> | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => state;

function set(next: BudgetState) {
  state = next;
  listeners.forEach((listener) => listener());
}

/** Asks domfin-api for the budget again. */
export function refreshBudget(): Promise<void> {
  request ??= apiGet<Budget>('/ledger/budget')
    .then((budget) => set({ status: 'ready', budget }))
    .catch(() => set({ ...state, status: 'offline' }))
    .finally(() => {
      request = null;
    });
  return request;
}

/** The monthly budget (fixed costs, dismissed suggestions, planned income), shared by every screen. */
export function useBudget(): BudgetState {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    if (current.status !== 'ready') void refreshBudget();
  }, [current.status]);
  return current;
}

/** Saves the whole budget, as domfin-api keeps it; the new fixed costs come back with their IDs. */
export async function saveBudget(next: BudgetInput): Promise<Budget> {
  const saved = await apiSend<Budget>('PUT', '/ledger/budget', next);
  set({ status: 'ready', budget: saved });
  return saved;
}

// Each change sends the budget as it is now, with that change.
const current = () => state.budget;

/** Adds a fixed cost (from a suggestion, or by hand), no longer turned down if it was. */
export const addFixedCost = (item: FixedCostInput) =>
  saveBudget({
    ...current(),
    items: [...current().items, item],
    dismissed: current().dismissed.filter((match) => match !== item.match),
  });

export const updateFixedCost = (item: FixedCost) =>
  saveBudget({ ...current(), items: current().items.map((other) => (other.id === item.id ? item : other)) });

export const removeFixedCost = (id: string) =>
  saveBudget({ ...current(), items: current().items.filter((item) => item.id !== id) });

/** Stops suggesting a payee, or (`false`) suggests it again. */
export const dismissSuggestion = (match: string, dismissed = true) =>
  saveBudget({
    ...current(),
    dismissed: dismissed ? [...current().dismissed, match] : current().dismissed.filter((other) => other !== match),
  });

/** The income to plan with; none plans with the salary. */
export const setPlannedIncome = (income: Money | undefined) =>
  saveBudget({ items: current().items, dismissed: current().dismissed, ...(income ? { income } : {}) });
