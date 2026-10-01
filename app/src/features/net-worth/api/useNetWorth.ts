import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  assetInstitution,
  institutionFor,
  isAsset,
  latestStatementOf,
  liveClass,
  liveType,
  monthlyBalances,
  useLiveAccounts,
} from '@/features/accounts';
import { useConverter } from '@/features/currency';
import { accountName } from '@/features/ledger';
import { LEDGER_MONTHS, type MonthRange } from '@/lib/period';

import { buildNetWorthSummary, type NetWorthAccount } from '../lib/summary';
import type { NetWorthSummary } from '../types';

/**
 * Net worth for a month range, in the display currency, from the balances of
 * the accounts found in the imported statements.
 */
export function useNetWorth(range: MonthRange): NetWorthSummary & { status: 'loading' | 'ready' | 'offline' } {
  // `t` changes with the language, so switching it rebuilds the summary with the new type names.
  const { t } = useTranslation();
  const { start, end } = range;
  const converter = useConverter();
  const live = useLiveAccounts();
  return useMemo(() => {
    const accounts = live.accounts.map((account): NetWorthAccount => {
      const type = liveType(account.kind);
      const { opening, balances } = monthlyBalances(account, LEDGER_MONTHS);
      return {
        id: account.id,
        name: accountName(account, live.accounts, t),
        institution: isAsset(account)
          ? assetInstitution(account, t).name
          : institutionFor(account.institution).name,
        mask: account.last4,
        type,
        class: liveClass(type),
        currency: account.currency,
        openingBalance: opening,
        balances,
      };
    });
    const latestStatement = latestStatementOf(live.accounts);
    return {
      ...buildNetWorthSummary(accounts, { start, end }, latestStatement, converter, t),
      status: live.status,
    };
  }, [start, end, converter, t, live]);
}
