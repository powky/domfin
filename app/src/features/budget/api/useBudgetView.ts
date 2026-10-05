import { useMemo } from 'react';

import { useLatestStatement, useLiveAccounts } from '@/features/accounts';
import { useConverter, valueInDisplay } from '@/features/currency';
import { useLedger, useLedgerNames, type LedgerNames } from '@/features/ledger';
import { monthsBetween, today } from '@/lib/dates';

import { monthPlan, plannedIncome, type MonthPlan } from '../lib/plan';
import {
  MIN_MONTHS,
  findRecurring,
  indexPayments,
  lastMonths,
  type PaymentIndex,
  type RecurringPayment,
} from '../lib/recurring';
import type { Budget, FixedCost } from '../types';
import { useBudget } from './budget';

/** A suggestion, with what it costs a month in the display currency (cents). */
export type Suggestion = RecurringPayment & { planned: number };

export type BudgetView = {
  /** `empty` when no statement is imported yet. */
  status: 'loading' | 'ready' | 'offline' | 'empty';
  budget: Budget;
  plan: MonthPlan;
  /** Payments that repeat and aren't fixed costs yet, the most expensive first. */
  suggestions: Suggestion[];
  /** Repeated payments the user turned down, still found: to bring one back. */
  dismissed: Suggestion[];
  /** Enough months of statements to tell what repeats. */
  enoughHistory: boolean;
  /** The last day the statements cover, `YYYY-MM-DD` ('' without statements). */
  through: string;
  /** The last month with statements, 'YYYY-MM'. */
  lastMonth: string;
  index: PaymentIndex;
  names: LedgerNames;
};

/**
 * The budget of `month` ('YYYY-MM'): its plan, the fixed costs with where
 * each stands, and the payments that repeat, from the ledger and the
 * budget saved in domfin-api.
 */
export function useBudgetView(month: string): BudgetView {
  const ledger = useLedger();
  const { status: budgetStatus, budget } = useBudget();
  const converter = useConverter();
  const latestStatement = useLatestStatement();
  const { accounts } = useLiveAccounts();
  const names = useLedgerNames(ledger);

  // The ledger is newest first: its first movement is the last day there's data for.
  const through = latestStatement ?? ledger.movements[0]?.date ?? '';
  const index = useMemo(() => indexPayments(ledger.movements), [ledger.movements]);
  const recurring = useMemo(
    () => (through ? findRecurring(ledger.movements, through) : []),
    [ledger.movements, through],
  );
  const statementOf = useMemo(() => new Map(accounts.map((account) => [account.id, account.asOf])), [accounts]);

  return useMemo(() => {
    const toDisplay = (amount: number, currency: FixedCost['currency']) => converter.toDisplay(amount, currency);
    const valueOf = (movement: (typeof ledger.movements)[number]) => valueInDisplay(converter, movement);
    const income = plannedIncome(ledger.movements, through || `${month}-01`, valueOf, toDisplay, budget.income);
    const plan = monthPlan({
      movements: ledger.movements,
      index,
      items: budget.items,
      month,
      // Whether a payment is late goes by the statements of the account it's paid from.
      throughOf: (item) => (item.accountId && statementOf.get(item.accountId)) || through,
      today: today(),
      valueOf,
      toDisplay,
      income,
    });
    const fixed = new Set(budget.items.map((item) => `${item.match}|${item.currency}`));
    const priced = recurring
      .filter((payment) => !fixed.has(`${payment.match}|${payment.currency}`))
      .map((payment) => ({ ...payment, planned: toDisplay(payment.amount, payment.currency) }))
      .sort((a, b) => b.planned - a.planned);
    const dismissed = new Set(budget.dismissed);
    const firstMonth = ledger.movements[ledger.movements.length - 1]?.date.slice(0, 7);
    const lastMonth = through ? lastMonths(through).month : month;
    const status =
      ledger.status !== 'ready' || budgetStatus !== 'ready'
        ? ledger.status === 'offline' || budgetStatus === 'offline'
          ? 'offline'
          : 'loading'
        : ledger.movements.length === 0
          ? 'empty'
          : 'ready';
    return {
      status,
      budget,
      plan,
      suggestions: priced.filter((payment) => !dismissed.has(payment.match)),
      dismissed: priced.filter((payment) => dismissed.has(payment.match)),
      enoughHistory: !!firstMonth && monthsBetween(firstMonth, lastMonth) + 1 >= MIN_MONTHS,
      through,
      lastMonth,
      index,
      names,
    };
  }, [ledger, budget, budgetStatus, converter, month, through, index, recurring, statementOf, names]);
}
