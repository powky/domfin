import type { ChartColor } from '@/theme';

export type BreakdownMode = 'groups' | 'categories' | 'merchants';

export type { MonthRange, PeriodPreset } from '@/lib/period';

export type SpendingItem = {
  id: string;
  label: string;
  /** Secondary label, e.g. the group of a category. */
  context?: string;
  amount: number;
  /** Share of total spending in the period. */
  share: number;
  color: ChartColor;
  /** Amount per month in the period. */
  monthly: number[];
};

export type SpendingSummary = {
  months: string[];
  total: number;
  averagePerMonth: number;
  largestGroup: SpendingItem | null;
  transactions: number;
  groups: SpendingItem[];
  categories: SpendingItem[];
  merchants: SpendingItem[];
  /** Date of the latest imported statement, `YYYY-MM-DD`. */
  latestStatement?: string;
  /** Whether domfin-api has answered with the ledger. */
  status: 'loading' | 'ready' | 'offline';
};
