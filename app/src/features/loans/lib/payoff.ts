import type { LedgerMovement } from '@/features/ledger/types';

/**
 * What the user tells about a loan that its history doesn't print. Amounts
 * are cents of the loan's currency.
 */
export type LoanTerms = {
  /** Annual interest rate: 0.125 is 12.5%. */
  rate: number;
  /** Paid each month, capital and interest. */
  installment: number;
  /** Of each installment, what someone else pays (an employer that subsidizes it). */
  subsidy?: number;
};

/** A year of what's left: its interest and capital, and what's owed at its end. */
export type PayoffYear = { year: string; interest: number; principal: number; balance: number };

/** How a loan ends: in cents of its currency, months as `YYYY-MM`. */
export type Payoff =
  | { status: 'paid' }
  /** The installment doesn't cover a month's interest: the debt doesn't go down. */
  | { status: 'never'; interest: number }
  | {
      status: 'ends';
      /** Installments left, the last one included. */
      payments: number;
      first: string;
      last: string;
      /** The last installment, smaller than the others when what's left is less. */
      lastAmount: number;
      /** What's left to pay: the capital owed, its interest, and both. */
      principal: number;
      interest: number;
      total: number;
      /** Of what's left, what you pay and what someone else does. */
      yours: number;
      theirs: number;
      years: PayoffYear[];
    };

/** No plan runs longer than a hundred years: past that, the debt never ends for anyone. */
const MAX_PAYMENTS = 1200;

/** "2026-11" plus 3 months is "2027-02". */
export function addMonths(month: string, count: number) {
  const [year, number] = month.split('-').map(Number);
  const index = year * 12 + (number - 1) + count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/**
 * How a loan that owes `balance` ends with `terms`, its first installment
 * in `first` (`YYYY-MM`). Each month the installment pays first the
 * interest of what's owed (the annual rate over 12) and the rest goes to
 * capital; the last one pays what's left. Banks count interest by the day,
 * so this is close, not to the cent.
 */
export function payoff(balance: number, terms: LoanTerms, first: string): Payoff {
  if (balance <= 0) return { status: 'paid' };
  const monthly = terms.rate / 12;
  const firstInterest = Math.round(balance * monthly);
  if (terms.installment <= firstInterest) return { status: 'never', interest: firstInterest };
  const subsidy = Math.min(Math.max(terms.subsidy ?? 0, 0), terms.installment);

  let owed = balance;
  let interest = 0;
  let yours = 0;
  let theirs = 0;
  let payments = 0;
  let lastAmount = 0;
  const years: PayoffYear[] = [];
  for (let month = first; owed > 0 && payments < MAX_PAYMENTS; month = addMonths(month, 1)) {
    const charge = Math.round(owed * monthly);
    let capital = Math.min(owed, terms.installment - charge);
    // The cents rounding leaves go in this installment, not in one more of a few cents.
    if (owed - capital < terms.installment / 100) capital = owed;
    const paid = capital + charge;
    owed -= capital;
    interest += charge;
    payments += 1;
    lastAmount = paid;
    const theirsNow = Math.min(subsidy, paid);
    theirs += theirsNow;
    yours += paid - theirsNow;

    const year = month.slice(0, 4);
    let row = years[years.length - 1];
    if (!row || row.year !== year) {
      row = { year, interest: 0, principal: 0, balance: owed };
      years.push(row);
    }
    row.interest += charge;
    row.principal += capital;
    row.balance = owed;
  }
  if (owed > 0) return { status: 'never', interest: firstInterest };
  return {
    status: 'ends',
    payments,
    first,
    last: addMonths(first, payments - 1),
    lastAmount,
    principal: balance,
    interest,
    total: balance + interest,
    yours,
    theirs,
    years,
  };
}

/** What a loan's movements say it has cost so far, in cents of its currency. */
export type LoanHistory = {
  /** Lent in the movements imported. */
  disbursed: number;
  /** All that was paid. */
  paid: number;
  /** Of the payments whose split the bank printed: what went to capital, and to interest and charges. */
  principalPaid: number;
  interestPaid: number;
  /** The latest regular installment, not a payoff. */
  lastPayment?: { date: string; amount: number };
};

/**
 * Sums a bank loan's own movements: payments come in (positive), what was
 * lent goes out (negative). The bank prints how much of each payment went to
 * capital; the rest is interest and charges.
 */
export function loanHistory(movements: readonly Pick<LedgerMovement, 'date' | 'amount' | 'kind' | 'principal'>[]) {
  const history: LoanHistory = { disbursed: 0, paid: 0, principalPaid: 0, interestPaid: 0 };
  for (const movement of movements) {
    if (movement.amount < 0) {
      history.disbursed -= movement.amount;
      continue;
    }
    history.paid += movement.amount;
    if (movement.principal !== undefined) {
      history.principalPaid += movement.principal;
      history.interestPaid += movement.amount - movement.principal;
    }
    const last = history.lastPayment;
    if (movement.kind !== 'payoff' && (!last || movement.date > last.date)) {
      history.lastPayment = { date: movement.date, amount: movement.amount };
    }
  }
  return history;
}

/**
 * The month of the next installment: the one after the latest payment, but
 * not before the month of the balance it starts from (`asOf`, `YYYY-MM-DD`).
 */
export function nextInstallment(asOf: string, lastPayment?: string) {
  const month = asOf.slice(0, 7);
  if (!lastPayment) return addMonths(month, 1);
  const next = addMonths(lastPayment.slice(0, 7), 1);
  return next < month ? month : next;
}

/**
 * Of a loan's capital, the share already paid (0 to 1): what was lent, or
 * if the history starts later, what's owed now plus what's been paid of it.
 */
export function paidShare(balance: number, history: LoanHistory) {
  const lent = Math.max(history.disbursed, balance + history.principalPaid);
  return lent > 0 ? Math.min(Math.max(1 - balance / lent, 0), 1) : undefined;
}
