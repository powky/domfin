import type { TFunction } from 'i18next';

import type { AccountClass, AccountType } from '@/features/accounts';
import { inDisplay, type Converter } from '@/features/currency';
import { sumCents, type Currency } from '@/lib/currency';
import type { MonthRange } from '@/lib/period';

import type { AccountSummary, BalanceSheetSide, NetWorthSummary } from '../types';
import { accountTypes, typeOrder } from './accountTypes';
import { monthKeyAt } from './months';

/** An account with a month-end balance for each of `LEDGER_MONTHS`, in its own currency. */
export type NetWorthAccount = {
  id: string;
  name: string;
  institution: string;
  mask?: string;
  type: AccountType;
  class: AccountClass;
  currency: Currency;
  /** Balance at the end of the month before the first ledger month. */
  openingBalance: number;
  balances: number[];
};

/** Month-end balance for a ledger index, in the account's currency; -1 is the opening balance. */
const nativeBalanceAt = (account: NetWorthAccount, index: number) =>
  index < 0 ? account.openingBalance : account.balances[index];

/** Every amount in the summary is in the display currency; `t` names the account types in the app language. */
export function buildNetWorthSummary(
  accounts: NetWorthAccount[],
  range: MonthRange,
  latestStatement: string | undefined,
  converter: Converter,
  t: TFunction,
): NetWorthSummary {
  const balanceAt = (account: NetWorthAccount, index: number) =>
    inDisplay(converter, nativeBalanceAt(account, index), account.currency);
  // A one-month period also charts the month before it, so there is a line to read.
  const firstIndex = range.start === range.end ? range.start - 1 : range.start;
  const indices = Array.from({ length: range.end - firstIndex + 1 }, (_, offset) => firstIndex + offset);
  const sumAt = (series: number[][], point: number) => sumCents(series.map((values) => values[point]));

  const side = (accountClass: AccountClass): BalanceSheetSide => {
    const own = accounts.filter((account) => account.class === accountClass);
    const total = sumCents(own.map((account) => balanceAt(account, range.end)));
    const shareOf = (amount: number) => (total > 0 ? amount / total : 0);

    const types = typeOrder[accountClass]
      .map((type) => {
        const typeAccounts: AccountSummary[] = own
          .filter((account) => account.type === type)
          .map((account) => {
            const balance = balanceAt(account, range.end);
            return {
              id: account.id,
              name: account.name,
              institution: account.institution,
              mask: account.mask,
              type: account.type,
              class: account.class,
              balance,
              native:
                account.currency === converter.currency
                  ? undefined
                  : { currency: account.currency, balance: nativeBalanceAt(account, range.end) },
              share: shareOf(balance),
              values: indices.map((index) => balanceAt(account, index)),
            };
          })
          .sort((a, b) => b.balance - a.balance);
        const balance = sumCents(typeAccounts.map((account) => account.balance));
        return {
          type,
          label: t(`accountTypes.${type}`),
          ...accountTypes[type],
          balance,
          share: shareOf(balance),
          values: indices.map((_, point) => sumAt(typeAccounts.map((account) => account.values), point)),
          accounts: typeAccounts,
        };
      })
      .filter((type) => type.accounts.length > 0);

    return {
      total,
      types,
      values: indices.map((_, point) => sumAt(types.map((type) => type.values), point)),
    };
  };

  const netWorthAt = (index: number) =>
    sumCents(accounts.map((account) => (account.class === 'asset' ? 1 : -1) * balanceAt(account, index)));

  const assets = side('asset');
  const liabilities = side('liability');
  const netWorth = sumCents([assets.total, -liabilities.total]);

  return {
    months: indices.map(monthKeyAt),
    startMonth: monthKeyAt(range.start),
    endMonth: monthKeyAt(range.end),
    netWorth,
    change: sumCents([netWorth, -netWorthAt(range.start - 1)]),
    netWorthValues: indices.map((_, point) => sumCents([assets.values[point], -liabilities.values[point]])),
    assets,
    liabilities,
    latestStatement,
  };
}
