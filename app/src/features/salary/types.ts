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

/** A gross monthly salary set by hand, from a month (`YYYY-MM`) on. */
export type SalaryEntry = { since: string; amount: number; currency: Currency };

/** What the salary is figured with besides the stubs (domfin-api's `/ledger/salary`). */
export type SalarySettings = {
  entries: SalaryEntry[];
  /** The day the job started, `YYYY-MM-DD`: the bonus is 45 days of salary before three years, 60 after. */
  hiredOn?: string;
  /** The month the bonus is paid, 1–12; 0 when it isn't, absent when not told. */
  bonusMonth?: number;
};
