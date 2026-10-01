import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import {
  assetInstitution,
  institutionFor,
  isAsset,
  latestStatementOf,
  monthlyBalances,
  useLiveAccounts,
} from '@/features/accounts';
import { inDisplay, useConverter, valueInDisplay } from '@/features/currency';
import { accountName, installmentDates, useAssets, useLedger, type LedgerMovement } from '@/features/ledger';
import { sumCents } from '@/lib/currency';
import { today } from '@/lib/dates';
import { LEDGER_MONTHS } from '@/lib/period';

import type { LoanSummary, LoansOverview, MonthRange } from '../types';

/**
 * The loans found in the imported histories for a period: balances from
 * domfin-api's accounts, payments from its ledger (or, for one someone else
 * pays, from its schedule). Each loan stays in its
 * currency; totals are in the display currency.
 */
export function useLoans({ start, end }: MonthRange): LoansOverview {
  const converter = useConverter();
  const { t } = useTranslation();
  const live = useLiveAccounts();
  const ledger = useLedger();
  const { assets } = useAssets();
  return useMemo(() => {
    const months = LEDGER_MONTHS.slice(start, end + 1);
    const inPeriod = new Set(months);
    // Every loan's payments in the period, in the display currency at the rate of their dates.
    const paidInDisplay: number[] = [];
    const loans = live.accounts
      .filter((account) => account.kind === 'loan')
      .map((account): LoanSummary => {
        const { opening, balances } = monthlyBalances(account, LEDGER_MONTHS);
        const before = start === 0 ? opening : balances[start - 1];
        // Money into the loan pays it down; disbursements come out of it. A
        // debt outside a bank is paid from your accounts, linked to it.
        const debtId = isAsset(account) ? account.id.slice('asset:'.length) : null;
        // One someone else pays is paid by its installments, up to today.
        const scheduled = assets.find((asset) => asset.id === debtId && asset.schedule);
        const payments: Pick<LedgerMovement, 'date' | 'amount' | 'currency' | 'amounts'>[] = scheduled?.schedule
          ? installmentDates({
              amount: scheduled.installment ?? 0,
              everyMonths: 1,
              first: scheduled.schedule.first,
              last: scheduled.schedule.last,
            })
              .filter((date) => date <= today())
              .reverse()
              .map((date) => ({ date, amount: -(scheduled.installment ?? 0), currency: account.currency }))
          : ledger.movements.filter((movement) =>
              debtId
                ? movement.assetId === debtId && movement.amount < 0
                : movement.accountId === account.id && movement.amount > 0,
            );
        const periodPayments = payments.filter((movement) => inPeriod.has(movement.date.slice(0, 7)));
        paidInDisplay.push(...periodPayments.map((movement) => Math.abs(valueInDisplay(converter, movement)) / 100));
        const last = payments[0];
        return {
          id: account.id,
          name: accountName(account, live.accounts, t),
          institution: isAsset(account) ? assetInstitution(account, t) : institutionFor(account.institution, account.asOf),
          mask: account.last4,
          currency: account.currency,
          balance: balances[end],
          change: sumCents([balances[end], -before]),
          paidInPeriod: sumCents(periodPayments.map((movement) => Math.abs(movement.amount) / 100)),
          paymentsInPeriod: periodPayments.length,
          lastPayment: last ? { date: last.date, amount: Math.abs(last.amount) / 100 } : undefined,
          asOf: account.asOf,
          href: { pathname: '/accounts/[id]', params: { id: account.id } },
        };
      });
    const shown = (loan: LoanSummary, amount: number) => inDisplay(converter, amount, loan.currency);
    loans.sort((a, b) => shown(b, b.balance) - shown(a, a.balance));
    const latestStatement = latestStatementOf(live.accounts);

    return {
      status: live.status,
      months: [...months],
      loans,
      totalOwed: sumCents(loans.map((loan) => shown(loan, loan.balance))),
      change: sumCents(loans.map((loan) => shown(loan, loan.change))),
      paidInPeriod: sumCents(paidInDisplay),
      paymentsInPeriod: loans.reduce((count, loan) => count + loan.paymentsInPeriod, 0),
      latestStatement,
    };
  }, [start, end, converter, t, live, ledger.movements, assets]);
}
