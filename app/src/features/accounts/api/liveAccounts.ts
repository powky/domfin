import { useEffect, useSyncExternalStore } from 'react';

import type { Currency } from '@/lib/currency';
import { addMonths } from '@/lib/dates';
import { LEDGER_MONTHS } from '@/lib/period';
import { apiGet } from '@/services/api/client';

/**
 * Kinds of account domfin-api finds in the imported statements, plus the
 * assets no statement shows: a home (`real_estate`), shares (`brokerage`),
 * a pension fund (`pension`) and a vehicle (`vehicle`).
 */
export type LiveAccountKind =
  | 'savings'
  | 'checking'
  | 'credit_card'
  | 'loan'
  | 'certificate'
  | 'real_estate'
  | 'brokerage'
  | 'pension'
  | 'vehicle';

/** An asset (or a debt) no statement shows, worth nothing before its first payment. */
export const isAsset = (account: Pick<LiveAccount, 'id'>) => account.id.startsWith('asset:');

/**
 * An account from domfin-api's `GET /accounts`, found in the imported
 * statements. Amounts are in cents, as the bank prints them: what a bank
 * account or certificate holds, what's owed on a card or loan.
 */
export type LiveAccount = {
  /** Stable, like "popular:savings:1234:DOP": the ledger's account id. */
  id: string;
  /** The bank's id, like "popular". */
  institution: string;
  kind: LiveAccountKind;
  /** The product for display ("Contigo"); loans and certificates carry a generic one. */
  name: string;
  last4: string;
  currency: Currency;
  balance: number;
  /** Date of the latest statement or history, `YYYY-MM-DD`. */
  asOf: string;
  creditLimit?: number;
  /** Month-end balances; null before the account's first statement. */
  months: { month: string; balance: number | null }[];
};

export type LiveAccountsState = {
  /** `offline` when domfin-api didn't answer; the last accounts it sent are kept. */
  status: 'loading' | 'ready' | 'offline';
  accounts: LiveAccount[];
};

// Screens pick periods among the ledger's months; the month before the
// first one gives the balance a period starts from.
const FROM = addMonths(LEDGER_MONTHS[0], -1);
const TO = LEDGER_MONTHS[LEDGER_MONTHS.length - 1];

let state: LiveAccountsState = { status: 'loading', accounts: [] };
let request: Promise<void> | null = null;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => state;

function set(next: LiveAccountsState) {
  state = next;
  listeners.forEach((listener) => listener());
}

/** Asks domfin-api for the accounts again, e.g. after importing statements. */
export function refreshLiveAccounts(): Promise<void> {
  request ??= apiGet<{ accounts: LiveAccount[] }>(`/accounts?from=${FROM}&to=${TO}`)
    .then(({ accounts }) => set({ status: 'ready', accounts }))
    .catch(() => set({ status: 'offline', accounts: state.accounts }))
    .finally(() => {
      request = null;
    });
  return request;
}

/** The accounts found in the imported statements, fetched when a screen opens. */
export function useLiveAccounts(): LiveAccountsState {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    void refreshLiveAccounts();
  }, []);
  return current;
}

/** Date of the latest imported statement, `YYYY-MM-DD`, once domfin-api answers. */
export function useLatestStatement(): string | undefined {
  const { accounts } = useLiveAccounts();
  return latestStatementOf(accounts);
}

/** The latest statement among the accounts; assets have payments, not statements. */
export const latestStatementOf = (accounts: readonly LiveAccount[]) =>
  accounts.filter((account) => !isAsset(account)).reduce((latest, account) => (account.asOf > latest ? account.asOf : latest), '') ||
  undefined;
