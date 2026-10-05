import type { Currency } from '@/lib/currency';

/** Something paid every month, as domfin-api's `GET /ledger/budget` keeps it. */
export type FixedCost = {
  id: string;
  name: string;
  /** The payee its payments are matched by (`payeeOf`); absent when added by hand. */
  match?: string;
  categoryId?: string;
  /** The account it's paid from, whose statements say whether it's been paid yet. */
  accountId?: string;
  /** What it costs a month, in cents of `currency`. */
  amount: number;
  currency: Currency;
  /** Day of the month it's usually paid. */
  day?: number;
};

/** A fixed cost on its way to domfin-api, which gives the new ones their ID. */
export type FixedCostInput = Omit<FixedCost, 'id'> & { id?: string };

export type Money = { amount: number; currency: Currency };

/** The monthly budget: fixed costs, the suggestions turned down (by payee) and, if set, the income to plan with. */
export type Budget = {
  items: FixedCost[];
  dismissed: string[];
  income?: Money;
};

export type BudgetInput = Omit<Budget, 'items'> & { items: FixedCostInput[] };
