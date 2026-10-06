import type { LedgerMovement } from '@/features/ledger/types';
import type { Currency } from '@/lib/currency';

/*
 * Payments that repeat month after month, found in the ledger: the
 * suggestions of the budget's fixed costs, and what each fixed cost was paid
 * every month. Pure functions over the ledger's movements; the hooks add the
 * user's budget and the currency.
 */

/** Months of history the suggestions look at, ending with the last complete one. */
export const WINDOW = 12;
/** Fewer months than this can't tell a habit from a coincidence. */
export const MIN_MONTHS = 3;

/**
 * Categories that are never a fixed cost even when they show up every
 * month: spending that follows what you do that month (the supermarket,
 * fuel, a movie, a trip), and the tax the bank withholds from your interest,
 * which you don't pay.
 */
const NOT_FIXED = new Set([
  'undetailed-cash',
  'groceries',
  'restaurants',
  'fast-food',
  'fuel',
  'rides',
  'tolls-parking',
  'clothing',
  'electronics',
  'stores',
  'shipping',
  'home-goods',
  'entertainment',
  'flights',
  'lodging',
  'travel-other',
  'withholding',
]);

/** Money put into an asset (the installments of a home bought off-plan): set aside every month, like a bill. */
const SAVED_EACH_MONTH = 'investment-in';

/** A payment that can be a fixed cost: money out to someone else, or into a plan you pay every month. */
export function isCommitment(movement: LedgerMovement) {
  if (movement.amount >= 0) return false;
  if (movement.flow === 'expense') return !movement.categoryId || !NOT_FIXED.has(movement.categoryId);
  return movement.flow === 'transfer' && movement.categoryId === SAVED_EACH_MONTH;
}

/** "PAG CLARO 8095550100 000456" → ["PAG", "CLARO"]: the words, without the numbers that change every month. */
function words(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((word) => word !== '' && !/\d/.test(word));
}

/**
 * Who a payment goes to, the same every month: the card's merchant or what
 * the bank printed, in capitals and without references, numbers or
 * punctuation ("PAG CLARO", "NETFLIX COM"). Empty when it's only numbers.
 */
export function payeeOf(movement: Pick<LedgerMovement, 'merchant' | 'description'>) {
  return words(movement.merchant || movement.description).join(' ');
}

/** A name to show for a payee: as the bank wrote it, without the numbers ("MB a INMOBILIARIA DEL ESTE"). */
export function nameOf(movement: Pick<LedgerMovement, 'merchant' | 'description'>) {
  const text = (movement.merchant || movement.description)
    .split(/\s+/)
    .filter((word) => word !== '' && !/\d/.test(word))
    .join(' ');
  return text || movement.merchant || movement.description;
}

/** "2026-09" moved n months (back when negative). */
export function addMonths(month: string, n: number) {
  const [year, number] = month.split('-').map(Number);
  const total = year * 12 + number - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function daysInMonth(month: string) {
  const [year, number] = month.split('-').map(Number);
  return new Date(year, number, 0).getDate();
}

const monthsBetween = (from: string, to: string) => {
  const [a, b] = [from, to].map((month) => {
    const [year, number] = month.split('-').map(Number);
    return year * 12 + number;
  });
  return b - a;
};

function median(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mostCommon<T>(values: readonly T[]): T {
  const counts = new Map<T, number>();
  let best = values[0];
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1;
    counts.set(value, count);
    if (count > (counts.get(best) ?? 0)) best = value;
  }
  return best;
}

/** What a payee was paid in a month: cents of its currency (less refunds), and the last day it was. */
export type MonthPayment = { amount: number; count: number; lastDate: string };

/** Payments by payee and currency (`payee|currency`), month by month ('YYYY-MM'). */
export type PaymentIndex = ReadonlyMap<string, ReadonlyMap<string, MonthPayment>>;

export const paymentKey = (payee: string, currency: Currency) => `${payee}|${currency}`;

/**
 * Every payment out of your accounts, by payee and month, less what it gave
 * back, to tell what each fixed cost was paid: whatever its category, so
 * recategorizing one doesn't hide it.
 */
export function indexPayments(movements: readonly LedgerMovement[]): PaymentIndex {
  const index = new Map<string, Map<string, MonthPayment>>();
  for (const movement of movements) {
    const out = movement.amount < 0;
    // Money out to someone else, or a refund of it; never income or money between your accounts coming in.
    if (movement.flow === 'income' || (!out && movement.flow !== 'expense')) continue;
    const payee = payeeOf(movement);
    if (!payee) continue;
    const key = paymentKey(payee, movement.currency);
    const months = index.get(key) ?? new Map<string, MonthPayment>();
    const month = movement.date.slice(0, 7);
    const paid = months.get(month) ?? { amount: 0, count: 0, lastDate: '' };
    months.set(month, {
      amount: paid.amount - movement.amount,
      count: paid.count + (out ? 1 : 0),
      lastDate: out && movement.date > paid.lastDate ? movement.date : paid.lastDate,
    });
    index.set(key, months);
  }
  return index;
}

/** A payment that repeats month after month: a suggestion for the budget. */
export type RecurringPayment = {
  /** The payee, as `payeeOf` gives it: what a fixed cost made from it matches. */
  match: string;
  name: string;
  currency: Currency;
  categoryId: string | null;
  accountId: string;
  /** What it usually costs a month (the middle month), in cents of its currency. */
  amount: number;
  /** The day of the month it's usually paid. */
  day: number;
  /** Months it was paid, of the months since it first was. */
  monthsPaid: number;
  monthsConsidered: number;
  /** Its amount changes from month to month by more than a tenth: a bill, not a subscription. */
  variable: boolean;
  /** The last day it was paid. */
  lastDate: string;
};

/**
 * The last month whose statements are in, and whether it's complete:
 * statements that end in its last days count it whole.
 */
export function lastMonths(through: string) {
  const month = through.slice(0, 7);
  const complete = Number(through.slice(8, 10)) >= daysInMonth(month) - 3;
  return { month, lastComplete: complete ? month : addMonths(month, -1) };
}

/**
 * Payments that look like fixed costs: paid in at least `MIN_MONTHS` of the
 * last `WINDOW` complete months, in three of every four months since the
 * first, still paid lately, once or twice a month, for about the same
 * amount (most months within a third of the usual). `through` is the last
 * day the statements cover; a payment of the month in course counts too.
 */
export function findRecurring(movements: readonly LedgerMovement[], through: string): RecurringPayment[] {
  const { month: endMonth, lastComplete } = lastMonths(through);
  const first = addMonths(lastComplete, -(WINDOW - 1));
  const groups = new Map<string, LedgerMovement[]>();
  for (const movement of movements) {
    const month = movement.date.slice(0, 7);
    if (month < first || movement.date > through || !isCommitment(movement)) continue;
    const payee = payeeOf(movement);
    if (!payee) continue;
    const key = paymentKey(payee, movement.currency);
    const group = groups.get(key);
    if (group) group.push(movement);
    else groups.set(key, [movement]);
  }

  const found: RecurringPayment[] = [];
  for (const group of groups.values()) {
    const byMonth = new Map<string, { amount: number; count: number }>();
    for (const movement of group) {
      const month = movement.date.slice(0, 7);
      const paid = byMonth.get(month) ?? { amount: 0, count: 0 };
      byMonth.set(month, { amount: paid.amount - movement.amount, count: paid.count + 1 });
    }
    const complete = [...byMonth].filter(([month, paid]) => month <= lastComplete && paid.amount > 0);
    if (complete.length < MIN_MONTHS) continue;
    const months = complete.map(([month]) => month).sort();
    const inCourse = endMonth !== lastComplete && (byMonth.get(endMonth)?.amount ?? 0) > 0;
    const considered = monthsBetween(months[0], lastComplete) + 1;
    const lately = months[months.length - 1] >= addMonths(lastComplete, -1) || inCourse;
    if (months.length / considered < 0.75 || !lately) continue;
    if (median(complete.map(([, paid]) => paid.count)) > 2) continue;
    const amounts = complete.map(([, paid]) => paid.amount);
    const usual = median(amounts);
    const within = (share: number) => amounts.filter((amount) => Math.abs(amount - usual) <= usual * share).length / amounts.length;
    if (within(1 / 3) < 0.75) continue;

    const latest = group.reduce((last, movement) => (movement.date > last.date ? movement : last));
    found.push({
      match: payeeOf(latest),
      name: nameOf(latest),
      currency: latest.currency,
      categoryId: mostCommon(group.map((movement) => movement.categoryId)),
      accountId: mostCommon(group.map((movement) => movement.accountId)),
      amount: Math.round(usual),
      day: Math.round(median(group.map((movement) => Number(movement.date.slice(8, 10))))),
      monthsPaid: months.length + (inCourse ? 1 : 0),
      monthsConsidered: considered + (inCourse ? 1 : 0),
      variable: within(0.1) < 0.8,
      lastDate: latest.date,
    });
  }
  return found;
}

/** Where a fixed cost stands in a month. */
export type PaymentStatus =
  /** Paid: what, and the last day. */
  | { kind: 'paid'; amount: number; date: string }
  /** Not paid yet, and the statements don't reach its day (or the month hasn't come). */
  | { kind: 'due'; date: string }
  /** Its day is a few days past what the statements cover and it isn't there. */
  | { kind: 'missing'; date: string }
  /** Added by hand: no payment to follow. */
  | { kind: 'manual' };

/** Days after its day a payment can still show up before it counts as missing. */
const GRACE_DAYS = 5;

/** `month`'s day `day`, or its last day when it's shorter (or `day` is 0). */
export function dayOf(month: string, day: number) {
  const last = daysInMonth(month);
  return `${month}-${String(day > 0 ? Math.min(day, last) : last).padStart(2, '0')}`;
}

const plusDays = (date: string, days: number) => {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
};

/** A fixed cost's payment in `month`, given what the statements cover (`through`). */
export function statusIn(
  index: PaymentIndex,
  item: { match?: string; currency: Currency; day?: number },
  month: string,
  through: string,
): PaymentStatus {
  if (!item.match) return { kind: 'manual' };
  const paid = index.get(paymentKey(item.match, item.currency))?.get(month);
  if (paid && paid.amount > 0) return { kind: 'paid', amount: paid.amount, date: paid.lastDate };
  const date = dayOf(month, item.day ?? 0);
  return plusDays(date, GRACE_DAYS) <= through ? { kind: 'missing', date } : { kind: 'due', date };
}

/** What a fixed cost was paid in each of `months`, in cents of its currency; 0 for none. */
export function paidByMonth(
  index: PaymentIndex,
  item: { match?: string; currency: Currency },
  months: readonly string[],
): number[] {
  const paid = item.match ? index.get(paymentKey(item.match, item.currency)) : undefined;
  return months.map((month) => Math.max(paid?.get(month)?.amount ?? 0, 0));
}
