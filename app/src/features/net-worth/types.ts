import type { AccountClass, AccountType } from '@/features/accounts';
import type { Currency } from '@/lib/currency';
import type { ChartColor } from '@/theme';

export type { AccountClass, AccountType };

export type AccountSummary = {
  id: string;
  name: string;
  institution: string;
  mask?: string;
  type: AccountType;
  class: AccountClass;
  /** Balance at the end of the period, in the display currency. Liabilities are positive amounts owed. */
  balance: number;
  /** The balance in the account's own currency, when that isn't the display currency. */
  native?: { currency: Currency; balance: number };
  /** Share of its side's total (assets or liabilities). */
  share: number;
  /** Month-end balance for each chart month. */
  values: number[];
};

export type AccountTypeSummary = {
  type: AccountType;
  label: string;
  color: ChartColor;
  balance: number;
  share: number;
  values: number[];
  accounts: AccountSummary[];
};

/** Assets or liabilities, grouped by account type. */
export type BalanceSheetSide = {
  total: number;
  values: number[];
  types: AccountTypeSummary[];
};

/** Amounts are in the display currency. */
export type NetWorthSummary = {
  /** Month keys (YYYY-MM) of the chart points. */
  months: string[];
  /** First and last month of the period. */
  startMonth: string;
  endMonth: string;
  netWorth: number;
  /** Net worth at the end of the period minus net worth right before it started. */
  change: number;
  netWorthValues: number[];
  assets: BalanceSheetSide;
  liabilities: BalanceSheetSide;
  /** Date of the latest imported statement, `YYYY-MM-DD`. */
  latestStatement?: string;
};

export type ChartMode = 'netWorth' | 'byType';

export type ChartScope = 'all' | 'assets' | 'liabilities';

/** An account charted from the lists, with the color it keeps while selected. */
export type SelectedAccount = { id: string; color: ChartColor };
