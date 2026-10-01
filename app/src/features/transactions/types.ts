import type { LedgerAccount } from '@/features/ledger';
import type { Currency } from '@/lib/currency';
import type { MonthRange } from '@/lib/period';
import type { AvatarTone } from '@/theme';

export type { MonthRange, PeriodPreset } from '@/lib/period';

export type TransactionKind = 'expense' | 'income' | 'transfer';

export type TransactionSplit = {
  categoryId: string;
  /** Signed, like the transaction amount. */
  amount: number;
};

export type Transaction = {
  id: string;
  /** Posting date, `YYYY-MM-DD`. */
  date: string;
  merchant: string;
  /** Brand color standing in for the merchant logo, when known. */
  merchantLogo?: AvatarTone;
  /** Signed: negative is money out of the account. */
  amount: number;
  /** The account's currency, which `amount` and the splits are in. */
  currency: Currency;
  /** Its value in pesos and in dollars at the BCRD rate of its date (see LedgerMovement). */
  amounts?: Partial<Record<Currency, number>>;
  accountId: string;
  kind: TransactionKind;
  /** `null` when uncategorized or split (split categories live in `splits`). */
  categoryId: string | null;
  splits?: TransactionSplit[];
  notes?: string;
  tags: string[];
  needsReview: boolean;
  /** Hidden transactions stay out of lists and totals unless asked for. */
  hidden: boolean;
  /** The investment it pays into (a home bought off-plan, shares), by name. */
  assetName?: string;
  /** Filed by the user's correction, which "automatic" undoes. */
  corrected?: boolean;
};

export type TransactionAccount = {
  id: string;
  name: string;
  currency: Currency;
  /** Which categories fit its movements depends on it: see `fits` in features/ledger. */
  kind?: LedgerAccount['kind'];
};

export type TransactionCategory = { id: string; label: string; kind: TransactionKind };

export type TransactionsData = {
  /** Newest first. */
  transactions: Transaction[];
  accounts: TransactionAccount[];
  categories: TransactionCategory[];
  /** Categories to file transactions under: by flow and group, "Category · Group". */
  categoryChoices: { value: string; label: string }[];
  /** Investments to link transactions to. */
  assetChoices: { value: string; label: string }[];
  tags: string[];
  /** Date of the latest imported statement, `YYYY-MM-DD`. */
  latestStatement?: string;
};

export type StatusFilter = 'all' | 'needs-review' | 'uncategorized' | 'split' | 'hidden';

/** `'all'` in any field means "don't filter by it". */
export type TransactionFilters = {
  query: string;
  status: StatusFilter;
  kind: TransactionKind | 'all';
  accountId: string;
  categoryId: string;
  tag: string;
  range: MonthRange;
};

/** Totals in the display currency. */
export type TransactionsSummary = {
  count: number;
  inflow: number;
  outflow: number;
  needsReview: number;
};

export type TransactionDay = {
  date: string;
  /** Net of every transaction that day matching the filters, including ones not shown yet, in the display currency. */
  total: number;
  transactions: Transaction[];
};
