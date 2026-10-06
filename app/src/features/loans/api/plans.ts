import { useEffect, useSyncExternalStore } from 'react';

import { apiGet, apiSend } from '@/services/api/client';

import type { LoanTerms } from '../lib/payoff';

/** Each loan's terms, by its account's ID, as domfin-api keeps them (`/ledger/loans`). */
export type LoanPlans = Record<string, LoanTerms>;

type PlansState = { status: 'loading' | 'ready' | 'offline'; plans: LoanPlans };

let state: PlansState = { status: 'loading', plans: {} };
let request: Promise<void> | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => state;

function set(next: PlansState) {
  state = next;
  listeners.forEach((listener) => listener());
}

/** Asks domfin-api for the loans' terms again. */
export function refreshLoanPlans(): Promise<void> {
  request ??= apiGet<{ plans: LoanPlans }>('/ledger/loans')
    .then(({ plans }) => set({ status: 'ready', plans }))
    .catch(() => set({ ...state, status: 'offline' }))
    .finally(() => {
      request = null;
    });
  return request;
}

/** The terms the user gave their loans (rate, installment, what someone else pays), shared by every screen. */
export function useLoanPlans(): PlansState {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    if (current.status !== 'ready') void refreshLoanPlans();
  }, [current.status]);
  return current;
}

/**
 * Saves a loan's terms, or takes them out with `null`. domfin-api keeps them
 * all together, so this sends every loan's, with the change.
 */
export async function saveLoanPlan(accountId: string, terms: LoanTerms | null) {
  const plans = { ...state.plans };
  if (terms) plans[accountId] = terms;
  else delete plans[accountId];
  const saved = await apiSend<{ plans: LoanPlans }>('PUT', '/ledger/loans', { plans });
  set({ status: 'ready', plans: saved.plans });
}
