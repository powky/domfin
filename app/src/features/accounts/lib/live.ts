import type { Href } from 'expo-router';
import type { TFunction } from 'i18next';

import { inDisplay, type Converter } from '@/features/currency';
import { accountName } from '@/features/ledger';
import { sumCents } from '@/lib/currency';

import { isAsset, type LiveAccount, type LiveAccountKind } from '../api/liveAccounts';
import type { AccountClass, AccountSummary, AccountType, Institution, MonthRange } from '../types';
import { institutionFor } from './institutions';

const types: Record<LiveAccountKind, AccountType> = {
  savings: 'cash',
  checking: 'cash',
  certificate: 'investment',
  brokerage: 'investment',
  real_estate: 'real-estate',
  pension: 'retirement',
  vehicle: 'vehicle',
  credit_card: 'credit-card',
  loan: 'loan',
};

/** How the app types an account domfin-api found. */
export const liveType = (kind: LiveAccountKind): AccountType => types[kind];

export const liveClass = (type: AccountType): AccountClass =>
  type === 'credit-card' || type === 'loan' ? 'liability' : 'asset';

/**
 * Each bank the accounts come from, with the date of its latest imported
 * statement: statements are imported, not synced.
 */
export function liveInstitutions(accounts: LiveAccount[]): Map<string, Institution> {
  const latest = new Map<string, string>();
  for (const account of accounts.filter((item) => !isAsset(item))) {
    if (account.asOf > (latest.get(account.institution) ?? '')) latest.set(account.institution, account.asOf);
  }
  return new Map([...latest].map(([id, asOf]) => [id, institutionFor(id, asOf)]));
}

/** An asset or debt no bank holds shows its kind where a bank's name and logo go. */
export function assetInstitution(account: LiveAccount, t: TFunction): Institution {
  const icons: Partial<Record<LiveAccountKind, Institution['icon']>> = {
    real_estate: 'property',
    loan: 'debt',
    pension: 'pension',
    vehicle: 'vehicle',
  };
  const icon = icons[account.kind] ?? 'shares';
  return { name: t(`accounts.assets.${icon}`), initials: '', tone: 'neutral', icon, syncedAt: account.asOf };
}

const detailHref = (id: string): Href => ({ pathname: '/accounts/[id]', params: { id } });

/**
 * An imported account as the Accounts screens show it: the balance at the
 * end of the period and the change over it, in its own currency. `months`
 * are the ledger's months; the account's balances start a month earlier.
 */
export function summarizeLive(
  account: LiveAccount,
  all: LiveAccount[],
  institutions: Map<string, Institution>,
  months: readonly string[],
  { start, end }: MonthRange,
  converter: Converter,
  t: TFunction,
): AccountSummary {
  const byMonth = new Map(account.months.map((month) => [month.month, month.balance]));
  const at = (month: string) => {
    const cents = byMonth.get(month);
    return cents === undefined || cents === null ? null : cents / 100;
  };
  // Months before the statements tell a balance (a loan whose history
  // starts later, an account opened later) take the first one they tell;
  // an asset is worth nothing before its first payment.
  const known = months.slice(start, end + 1).map(at);
  const first = isAsset(account) ? 0 : (known.find((value) => value !== null) ?? 0);
  const before = at(monthBefore(months[start])) ?? first;
  const history = known.map((value) => value ?? first);
  const balance = history[history.length - 1] ?? 0;
  const type = types[account.kind];
  return {
    id: account.id,
    name: accountName(account, all, t),
    institution: isAsset(account)
      ? assetInstitution(account, t)
      : (institutions.get(account.institution) ?? institutionFor(account.institution)),
    mask: account.last4,
    type,
    class: liveClass(type),
    currency: account.currency,
    balance,
    displayBalance: inDisplay(converter, balance, account.currency),
    startBalance: before,
    change: sumCents([balance, -before]),
    history,
    creditLimit: account.creditLimit === undefined ? undefined : account.creditLimit / 100,
    href: detailHref(account.id),
  };
}

function monthBefore(month: string) {
  const [year, number] = month.split('-').map(Number);
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, '0')}`;
}

/**
 * The account's balance at the end of each of `months`, in currency units,
 * and at the end of the month before them (`opening`). Months before its
 * statements tell a balance take the first one they tell, like the period
 * summaries above.
 */
export function monthlyBalances(account: LiveAccount, months: readonly string[]) {
  const byMonth = new Map(account.months.map((month) => [month.month, month.balance]));
  const at = (month: string) => {
    const cents = byMonth.get(month);
    return cents === undefined || cents === null ? null : cents / 100;
  };
  const known = months.map(at);
  const first = isAsset(account) ? 0 : (known.find((value) => value !== null) ?? 0);
  return { opening: at(monthBefore(months[0])) ?? first, balances: known.map((value) => value ?? first) };
}
