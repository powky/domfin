import type { ChartColor } from '@/theme';

export type FlowItem = {
  id: string;
  label: string;
  amount: number;
  color: ChartColor;
};

export type ExpenseGroup = FlowItem & {
  categories: FlowItem[];
};

export type CashFlowPeriod = {
  from: string;
  to: string;
};

export type CashFlowSummary = {
  period: CashFlowPeriod;
  income: {
    total: number;
    byCategory: FlowItem[];
    byMerchant: FlowItem[];
  };
  expenses: {
    total: number;
    byGroup: ExpenseGroup[];
    byMerchant: FlowItem[];
  };
  /** income.total - expenses.total */
  net: number;
  /**
   * What went into investments (contributions minus withdrawals, plus what
   * they earned and kept), by where it went: part of `net`, or more.
   */
  investments: { total: number; byDestination: FlowItem[] };
  /** net - investments.total: what stayed in your accounts; negative when drawn from them. */
  kept: number;
  /**
   * Loans paid into your accounts in the period (from a bank or a person).
   * They aren't income: when more went out than came in, they're what
   * covered it first.
   */
  borrowed: number;
};
