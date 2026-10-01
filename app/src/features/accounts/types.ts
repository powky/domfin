import type { Href } from 'expo-router';

import type { ImageSourcePropType } from 'react-native';

import type { Currency } from '@/lib/currency';
import type { AvatarTone } from '@/theme';

export type { MonthRange, PeriodPreset } from '@/lib/period';

export type AccountType = 'cash' | 'investment' | 'retirement' | 'real-estate' | 'vehicle' | 'credit-card' | 'loan';

export type AccountClass = 'asset' | 'liability';

/** A bank the accounts come from. */
export type Institution = {
  name: string;
  /** One or two letters for the avatar when there is no logo. */
  initials: string;
  /** Brand color behind the initials. */
  tone: AvatarTone;
  /** Official logo, fitted to the avatar circle. */
  logo?: ImageSourcePropType;
  /** For assets no bank holds: the icon of their kind instead of a logo. */
  icon?: 'property' | 'shares' | 'debt' | 'pension' | 'vehicle';
  /** Date of its latest imported statement, `YYYY-MM-DD`. */
  syncedAt: string;
};

export type AccountSummary = {
  id: string;
  name: string;
  institution: Institution;
  mask?: string;
  type: AccountType;
  class: AccountClass;
  /** The account's own currency: balances, change, history and limit are in it. */
  currency: Currency;
  /** Balance at the end of the period. Liabilities are positive amounts owed. */
  balance: number;
  /** `balance` in the display currency, for totals and sorting across currencies. */
  displayBalance: number;
  /** Balance at the end of the month before the period. */
  startBalance: number;
  change: number;
  /** Month-end balances in the period. */
  history: number[];
  creditLimit?: number;
  /** The account's page. */
  href: Href;
};

export type AccountGrouping = 'type' | 'institution';

export type AccountGroup = {
  id: string;
  label: string;
  accounts: AccountSummary[];
  /** Sum of balances in the display currency; only meaningful for groups of one class (by type). */
  total: number;
  /** Set when grouping by institution. */
  institution?: Institution;
};

/** Totals are in the display currency. */
export type AccountsOverview = {
  /**
   * The accounts come from domfin-api's imported statements: `loading` until
   * it answers, `offline` when it doesn't.
   */
  status: 'loading' | 'ready' | 'offline';
  /** Date of the latest imported statement, `YYYY-MM-DD`. */
  latestStatement?: string;
  months: string[];
  accounts: AccountSummary[];
  groups: Record<AccountGrouping, AccountGroup[]>;
  cash: number;
  creditUsed: number;
  creditLimit: number;
  assets: number;
  liabilities: number;
  counts: { assets: number; liabilities: number };
};

export type AccountTransaction = {
  id: string;
  /** 'YYYY-MM-DD' */
  date: string;
  merchant: string;
  category: string;
  /** Positive for money in, negative for money out. */
  amount: number;
  currency: Currency;
};

export type AccountDetail = {
  account: AccountSummary;
  months: string[];
  /** The period's movements, newest first. */
  transactions: AccountTransaction[];
  /** Money out in the period's transactions (purchases, on a card), in the account's currency. */
  moneyOut: number;
};
