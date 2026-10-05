import type { LedgerMovement } from '@/features/ledger/types';
import type { Currency } from '@/lib/currency';

import type { FixedCost, Money } from '../types';
import {
  addMonths,
  dayOf,
  lastMonths,
  payeeOf,
  paymentKey,
  statusIn,
  type PaymentIndex,
  type PaymentStatus,
} from './recurring';

/** Converts cents of a currency to cents of the display one, at today's rate. */
export type ToDisplay = (amount: number, currency: Currency) => number;
/** A movement in cents of the display currency, at the rate of its date. */
export type ValueOf = (movement: LedgerMovement) => number;

function median(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Where the income the month is planned with comes from. */
export type IncomeSource = 'set' | 'salary' | 'income' | 'none';

/**
 * The income to plan a month with, in display cents: the one the user set,
 * or what usually comes in: the salary of the last three complete months
 * (the middle one), or all the income when there's no salary.
 */
export function plannedIncome(
  movements: readonly LedgerMovement[],
  through: string,
  valueOf: ValueOf,
  toDisplay: ToDisplay,
  income?: Money,
): { amount: number; source: IncomeSource } {
  if (income) return { amount: toDisplay(income.amount, income.currency), source: 'set' };
  const { lastComplete } = lastMonths(through);
  const months = [0, 1, 2].map((n) => addMonths(lastComplete, -n));
  const monthly = (keep: (movement: LedgerMovement) => boolean) =>
    months
      .map((month) =>
        movements
          .filter((movement) => movement.date.startsWith(month) && movement.flow === 'income' && keep(movement))
          .reduce((total, movement) => total + valueOf(movement), 0),
      )
      .filter((total) => total > 0);
  const salary = monthly((movement) => movement.categoryId === 'salary');
  if (salary.length) return { amount: Math.round(median(salary)), source: 'salary' };
  const all = monthly(() => true);
  if (all.length) return { amount: Math.round(median(all)), source: 'income' };
  return { amount: 0, source: 'none' };
}

/**
 * A fixed cost in a month: where it stands, and what it's planned and paid
 * in the display currency. One added by hand counts as paid once its day
 * comes, since nothing shows it.
 */
export type FixedCostMonth = { item: FixedCost; status: PaymentStatus; planned: number; paid: number };

/** A month of the budget, in cents of the display currency. */
export type MonthPlan = {
  income: number;
  incomeSource: IncomeSource;
  /** What came in that month (so far). */
  received: number;
  /** Every fixed cost, as planned. */
  fixed: number;
  fixedPaid: number;
  /** What's left to pay of the fixed costs: the planned amount of those not paid yet. */
  fixedPending: number;
  /** Spending that isn't a fixed cost (so far): the supermarket, a dinner out, the pharmacy. */
  variable: number;
  /** Income minus the fixed costs and the variable spending; negative when it's over. */
  left: number;
  items: FixedCostMonth[];
};

/**
 * Plans `month`: the fixed costs, which are paid (as the statements of the
 * account each is paid from have them, `throughOf`), and what's left of the
 * income for everything else after what was spent. `today` is the date the
 * ones added by hand go by.
 */
export function monthPlan({
  movements,
  index,
  items,
  month,
  throughOf,
  today,
  valueOf,
  toDisplay,
  income,
}: {
  movements: readonly LedgerMovement[];
  index: PaymentIndex;
  items: readonly FixedCost[];
  month: string;
  throughOf: (item: FixedCost) => string;
  today: string;
  valueOf: ValueOf;
  toDisplay: ToDisplay;
  income: { amount: number; source: IncomeSource };
}): MonthPlan {
  const rows = items.map((item) => {
    const status = statusIn(index, item, month, throughOf(item));
    const planned = toDisplay(item.amount, item.currency);
    const paid =
      status.kind === 'paid'
        ? toDisplay(status.amount, item.currency)
        : status.kind === 'manual' && dayOf(month, item.day ?? 0) <= today
          ? planned
          : 0;
    return { item, status, planned, paid };
  });
  const fixed = rows.reduce((total, row) => total + row.planned, 0);
  const fixedPaid = rows.reduce((total, row) => total + row.paid, 0);
  const fixedPending = rows.reduce((total, row) => total + (row.paid > 0 ? 0 : row.planned), 0);

  // What a fixed cost was paid isn't variable spending, refunds included.
  const fixedPayees = new Set(items.filter((item) => item.match).map((item) => paymentKey(item.match ?? '', item.currency)));
  let variable = 0;
  let received = 0;
  for (const movement of movements) {
    if (!movement.date.startsWith(month)) continue;
    if (movement.flow === 'income') received += valueOf(movement);
    if (movement.flow !== 'expense' || fixedPayees.has(paymentKey(payeeOf(movement), movement.currency))) continue;
    variable -= valueOf(movement);
  }
  variable = Math.max(Math.round(variable), 0);

  return {
    income: income.amount,
    incomeSource: income.source,
    received: Math.round(received),
    fixed: Math.round(fixed),
    fixedPaid: Math.round(fixedPaid),
    fixedPending: Math.round(fixedPending),
    variable,
    left: Math.round(income.amount - fixedPaid - fixedPending - variable),
    items: rows,
  };
}
