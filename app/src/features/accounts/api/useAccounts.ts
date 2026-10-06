import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { sumInDisplay, useConverter } from '@/features/currency';
import { counterparty, useLedger, useLedgerNames } from '@/features/ledger';
import { sumCents } from '@/lib/currency';
import { LEDGER_MONTHS } from '@/lib/period';

import { ACCOUNT_TYPE_ORDER } from '../lib/accountTypes';
import { liveInstitutions, summarizeLive } from '../lib/live';
import { latestStatementOf, useLiveAccounts } from './liveAccounts';
import type {
  AccountDetail,
  AccountGroup,
  AccountSummary,
  AccountTransaction,
  AccountsOverview,
  MonthRange,
} from '../types';

const byBalance = (a: AccountSummary, b: AccountSummary) => b.displayBalance - a.displayBalance;
const total = (items: AccountSummary[]) => sumCents(items.map((item) => item.displayBalance));

function groupByType(items: AccountSummary[], t: TFunction): AccountGroup[] {
  return ACCOUNT_TYPE_ORDER.map((type) => {
    const members = items.filter((item) => item.type === type).sort(byBalance);
    return { id: type, label: t(`accountTypes.${type}`), accounts: members, total: total(members) };
  }).filter((group) => group.accounts.length > 0);
}

function groupByInstitution(items: AccountSummary[]): AccountGroup[] {
  const groups = new Map<string, AccountSummary[]>();
  for (const item of items) groups.set(item.institution.name, [...(groups.get(item.institution.name) ?? []), item]);
  return [...groups.entries()]
    .map(([name, members]) => ({
      id: name,
      label: name,
      accounts: members.sort(byBalance),
      total: total(members),
      institution: members[0].institution,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Every account found in the imported statements (domfin-api), with its
 * balance at the end of the period and the change over it, in its own
 * currency; totals in the display currency.
 */
export function useAccounts({ start, end }: MonthRange): AccountsOverview {
  const converter = useConverter();
  // `t` changes with the language, so the memo rebuilds the group names in it.
  const { t } = useTranslation();
  const live = useLiveAccounts();
  return useMemo(() => {
    const range = { start, end };
    const institutions = liveInstitutions(live.accounts);
    const items = live.accounts.map((account) =>
      summarizeLive(account, live.accounts, institutions, LEDGER_MONTHS, range, converter, t),
    );
    const ofType = (...types: AccountSummary['type'][]) => items.filter((item) => types.includes(item.type));
    const assets = items.filter((item) => item.class === 'asset');
    const liabilities = items.filter((item) => item.class === 'liability');
    const cards = ofType('credit-card');
    const latestStatement = latestStatementOf(live.accounts);

    return {
      status: live.status,
      latestStatement,
      months: [...LEDGER_MONTHS.slice(range.start, range.end + 1)],
      accounts: items,
      groups: { type: groupByType(items, t), institution: groupByInstitution(items) },
      cash: total(ofType('cash')),
      creditUsed: total(cards),
      creditLimit: sumInDisplay(
        converter,
        cards.map((card) => ({ amount: card.creditLimit ?? 0, currency: card.currency })),
      ),
      assets: total(assets),
      liabilities: total(liabilities),
      counts: { assets: assets.length, liabilities: liabilities.length },
    };
  }, [start, end, converter, t, live]);
}

/**
 * One imported account for its detail page, with the period's movements
 * from domfin-api's ledger. Null when the id is unknown, and undefined while
 * domfin-api hasn't answered.
 */
export function useAccount(id: string, { start, end }: MonthRange): AccountDetail | null | undefined {
  const converter = useConverter();
  // Loans and certificates are named in the current language.
  const { t } = useTranslation();
  const live = useLiveAccounts();
  const ledger = useLedger();
  const names = useLedgerNames(ledger);
  const account = live.accounts.find((item) => item.id === id);
  return useMemo(() => {
    if (!account) return live.status === 'loading' ? undefined : null;
    const months = LEDGER_MONTHS.slice(start, end + 1);
    const inPeriod = (date: string) => months.includes(date.slice(0, 7));
    const transactions = ledger.movements
      .filter((movement) => movement.accountId === id && inPeriod(movement.date))
      .map(
        (movement): AccountTransaction => ({
          id: movement.id,
          date: movement.date,
          merchant: counterparty(movement),
          merchantId: movement.merchantId,
          operation: movement.operation,
          person: movement.person,
          undetailedCash: movement.kind === 'undetailed_cash',
          category: names.category(movement.categoryId),
          amount: movement.amount / 100,
          currency: movement.currency,
        }),
      );
    return {
      account: summarizeLive(account, live.accounts, liveInstitutions(live.accounts), LEDGER_MONTHS, { start, end }, converter, t),
      months: [...months],
      transactions,
      moneyOut: sumCents(transactions.filter((item) => item.amount < 0).map((item) => -item.amount)),
    };
  }, [account, id, live, ledger.movements, names, start, end, converter, t]);
}
