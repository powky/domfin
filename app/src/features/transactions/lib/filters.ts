import { valueInDisplay, type Converter } from '@/features/currency';
import { monthsInRange } from '@/lib/period';

import type { Transaction, TransactionDay, TransactionFilters, TransactionsSummary } from '../types';
import { toPlainDecimal } from './format';

export const EMPTY_FILTERS: Omit<TransactionFilters, 'range'> = {
  query: '',
  status: 'all',
  kind: 'all',
  accountId: 'all',
  categoryId: 'all',
  tag: 'all',
};

export const isUncategorized = (transaction: Transaction) => transaction.categoryId === null && !transaction.splits;

/** Every category a transaction counts toward (several when split). */
export const categoryIdsOf = (transaction: Transaction) =>
  transaction.splits ? transaction.splits.map((split) => split.categoryId) : transaction.categoryId ? [transaction.categoryId] : [];

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Names the search matches besides merchant and notes, in the app language. Memoize it: it keys the cache. */
export type SearchLabels = {
  categories: ReadonlyMap<string, string>;
  uncategorized: string;
};

/** Search text per transaction, cached per labels so a language change never reuses the old names. */
const searchText = new WeakMap<SearchLabels, WeakMap<Transaction, string>>();

function textFor(transaction: Transaction, labels: SearchLabels) {
  let cache = searchText.get(labels);
  if (!cache) {
    cache = new WeakMap();
    searchText.set(labels, cache);
  }
  let text = cache.get(transaction);
  if (text === undefined) {
    const categories = categoryIdsOf(transaction).map((id) => labels.categories.get(id) ?? '');
    if (isUncategorized(transaction)) categories.push(labels.uncategorized);
    text = normalize([transaction.merchant, transaction.notes ?? '', ...categories].join(' '));
    cache.set(transaction, text);
  }
  return text;
}

/** Digits of an amount-looking query ("RD$1,760.29" → "1760.29", or "1.760,29" where cents follow a comma), or null. */
function amountQuery(query: string) {
  const digits = toPlainDecimal(query).replace(/[\s+-]/g, '');
  return /^(\d+\.?\d*|\.\d+)$/.test(digits) ? digits : null;
}

type PreparedQuery = { text: string; amount: string | null };

const prepareQuery = (query: string): PreparedQuery | null => {
  const text = normalize(query);
  return text ? { text, amount: amountQuery(text) } : null;
};

/** Merchant, notes and category names, or the amount when the query looks like one. */
function matchesQuery(transaction: Transaction, query: PreparedQuery, labels: SearchLabels) {
  if (query.amount && Math.abs(transaction.amount).toFixed(2).includes(query.amount)) return true;
  return textFor(transaction, labels).includes(query.text);
}

/** With a category filter, a split transaction only shows (and counts) its part in that category. */
function partIn(transaction: Transaction, categoryId: string): Transaction {
  const splits = transaction.splits?.filter((split) => split.categoryId === categoryId);
  if (!splits) return transaction;
  const cents = splits.reduce((total, split) => total + Math.round(split.amount * 100), 0);
  return { ...transaction, amount: cents / 100, splits };
}

export function filterTransactions(transactions: Transaction[], filters: TransactionFilters, labels: SearchLabels) {
  const matching = transactions.filter(matches(filters, labels));
  return filters.categoryId === 'all' ? matching : matching.map((transaction) => partIn(transaction, filters.categoryId));
}

function matches(filters: TransactionFilters, labels: SearchLabels) {
  const months = new Set<string>(monthsInRange(filters.range));
  const query = prepareQuery(filters.query);
  return (transaction: Transaction) => {
    if (!months.has(transaction.date.slice(0, 7))) return false;
    if (filters.status === 'hidden' ? !transaction.hidden : transaction.hidden) return false;
    if (filters.status === 'needs-review' && !transaction.needsReview) return false;
    if (filters.status === 'uncategorized' && !isUncategorized(transaction)) return false;
    if (filters.status === 'split' && !transaction.splits) return false;
    if (filters.kind !== 'all' && transaction.kind !== filters.kind) return false;
    if (filters.accountId !== 'all' && transaction.accountId !== filters.accountId) return false;
    if (filters.categoryId !== 'all' && !categoryIdsOf(transaction).includes(filters.categoryId)) return false;
    if (filters.tag !== 'all' && !transaction.tags.includes(filters.tag)) return false;
    return !query || matchesQuery(transaction, query, labels);
  };
}

/** Money in and out, in the display currency one transaction at a time, each at the rate of its date. */
export function summarize(transactions: Transaction[], converter: Converter): TransactionsSummary {
  let inflow = 0;
  let outflow = 0;
  let needsReview = 0;
  for (const transaction of transactions) {
    const cents = Math.round(valueInDisplay(converter, transaction) * 100);
    if (cents > 0) inflow += cents;
    else outflow -= cents;
    if (transaction.needsReview) needsReview += 1;
  }
  return { count: transactions.length, inflow: inflow / 100, outflow: outflow / 100, needsReview };
}

/**
 * Groups `shown` (a newest-first slice of `all`) by day. Totals come from
 * `all`, so a day cut by pagination still shows its full total, and are in
 * the display currency.
 */
export function groupByDay(shown: Transaction[], all: Transaction[], converter: Converter): TransactionDay[] {
  const totals = new Map<string, number>();
  for (const transaction of all) {
    const cents = Math.round(valueInDisplay(converter, transaction) * 100);
    totals.set(transaction.date, (totals.get(transaction.date) ?? 0) + cents);
  }
  const days: TransactionDay[] = [];
  for (const transaction of shown) {
    const last = days[days.length - 1];
    if (last?.date === transaction.date) last.transactions.push(transaction);
    else days.push({ date: transaction.date, total: (totals.get(transaction.date) ?? 0) / 100, transactions: [transaction] });
  }
  return days;
}
