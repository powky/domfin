import type { Currency } from '@/lib/currency';

/** What a pay stub's concept paid (the first six) or took (the last four, with `other`), as domfin-api tells them apart. */
export type PayKind = 'salary' | 'overtime' | 'bonus' | 'christmas' | 'benefit' | 'other';
export type DeductionKind = 'isr' | 'afp' | 'sfs' | 'other';

/** One concept of a pay stub; amounts in cents of pesos. */
export type PayslipLine = {
  concept: string;
  kind: PayKind | DeductionKind;
  deduction?: boolean;
  amount: number;
  /** The concept's total in the year so far, as printed. */
  yearToDate: number;
};

/** An imported pay stub (domfin-api's `GET /ledger/payslips`): its money is already in the ledger, as the payroll credit. */
export type Payslip = {
  id: number;
  employer: string;
  /** The payroll's date, `YYYY-MM-DD`. */
  paidOn: string;
  /** What reached the account, in cents. */
  net: number;
  status: 'ok' | 'review';
  issues?: string[];
  lines: PayslipLine[];
};

/**
 * A gross monthly salary set by hand, from a month (`YYYY-MM`) on, in cents.
 * The deductions are what the user's own stub says; the missing ones are
 * figured by law.
 */
export type SalaryEntry = {
  since: string;
  amount: number;
  currency: Currency;
  isr?: number;
  afp?: number;
  sfs?: number;
  other?: number;
};

/** How much an extra payment is: days of salary (23.83 a month), salaries, or a fixed amount. */
export type ExtraKind = 'days' | 'salaries' | 'fixed';

/** The ISR an extra payment pays: by the DGII's scale, a flat rate, or none. */
export type ExtraTax = 'scale' | 'rate' | 'none';

/** A payment the job makes besides the salary, as the user describes it. The Christmas salary is the law's, not one of these. */
export type Extra = {
  id: string;
  name: string;
  /** The month it's paid, 1–12. */
  month: number;
  kind: ExtraKind;
  /** The days or the salaries; with `seniority`, the days are the law's bonus's: 45 before three years in the job, 60 after. */
  value?: number;
  seniority?: boolean;
  /** A fixed amount, in cents of pesos. */
  amount?: number;
  /** The salary days and salaries are figured on: the year's average, or the one of the month it's paid in. */
  base?: 'average' | 'month';
  tax: ExtraTax;
  /** With `tax: 'rate'`: 0.25 is 25%. */
  rate?: number;
};

/** An extra payment on its way to domfin-api, which gives the new ones their ID. */
export type ExtraInput = Omit<Extra, 'id'> & { id?: string };

/** What the salary is figured with besides the stubs (domfin-api's `/ledger/salary`). */
export type SalarySettings = {
  entries: SalaryEntry[];
  /** The day the job started, `YYYY-MM-DD`: for the extra payments that go by seniority. */
  hiredOn?: string;
  extras: Extra[];
};

/** Settings on their way to domfin-api. */
export type SalarySettingsInput = Omit<SalarySettings, 'extras'> & { extras: ExtraInput[] };
