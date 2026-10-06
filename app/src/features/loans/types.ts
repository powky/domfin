import type { Href } from 'expo-router';

import type { Institution } from '@/features/accounts';
import type { Currency } from '@/lib/currency';

import type { LoanPlan } from './api/useLoanPlan';

export type { MonthRange, PeriodPreset } from '@/lib/period';

/**
 * A loan found in the imported histories. The bank's history lists
 * disbursements, payments and the balance after each, not the rate or the
 * term, so there is no schedule to project.
 */
export type LoanSummary = {
  /** Same id as the loan's account. */
  id: string;
  name: string;
  institution: Institution;
  mask?: string;
  /** Every amount of the loan is in it. */
  currency: Currency;
  /** Balance owed at the end of the period. */
  balance: number;
  /** Balance change over the period: negative when the debt went down. */
  change: number;
  /** Payments in the period. */
  paidInPeriod: number;
  paymentsInPeriod: number;
  /** The latest payment in the months the app shows. */
  lastPayment?: { date: string; amount: number };
  /** Date of its latest imported history, `YYYY-MM-DD`. */
  asOf: string;
  /** The loan's account page: balance history and movements. */
  href: Href;
  /** When it ends and what it costs, with the rate and installment the user gave it. */
  plan?: LoanPlan;
};

/** Totals are in the display currency; each loan keeps its own. */
export type LoansOverview = {
  /** Whether domfin-api has answered. */
  status: 'loading' | 'ready' | 'offline';
  months: string[];
  loans: LoanSummary[];
  totalOwed: number;
  /** Balance change over the period, summed. */
  change: number;
  paidInPeriod: number;
  paymentsInPeriod: number;
  /** Date of the latest imported statement, `YYYY-MM-DD`. */
  latestStatement?: string;
  /** Interest left on the loans whose end is known, and how many those are. */
  interestLeft: number;
  planned: number;
  /** When the last of them ends (`YYYY-MM`), if every loan still owed has a known end. */
  debtFree?: string;
};
