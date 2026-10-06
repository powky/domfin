import type { MonthSalary } from './salary';

/** The days a month's salary is divided by for a day's: the Ministerio de Trabajo's 23.83. */
export const DAYS_A_MONTH = 23.83;

/** What the employee pays the TSS out of the salary: 2.87% to the AFP and 3.04% to the SFS. It comes off before the ISR. */
const TSS = 0.0287 + 0.0304;

/**
 * The DGII's yearly ISR scale for salaries in 2026, in cents: from each
 * amount on, a fixed tax plus a rate on what's above it. 2027 brings a new
 * one.
 */
const ISR_SCALE = [
  { from: 416_220_01, base: 0, rate: 0.15 },
  { from: 624_329_01, base: 31_216_00, rate: 0.2 },
  { from: 867_123_01, base: 79_776_00, rate: 0.25 },
];

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

/**
 * The Christmas salary (Código de Trabajo, art. 219): a twelfth of the salary
 * earned in the year, paid in December. It pays no ISR up to that (art. 222)
 * nor TSS.
 */
export const christmasSalary = (months: MonthSalary[]) => Math.round(sum(months.map((month) => month.amount)) / 12);

/** The days of salary the bonus is (art. 223): 60 once the job is three years old when it's paid, 45 before. */
export function bonusDays(hiredOn: string, paidOn: string): 45 | 60 {
  const [year, ...rest] = hiredOn.split('-');
  return paidOn >= [Number(year) + 3, ...rest].join('-') ? 60 : 45;
}

/** The yearly ISR on a taxable income, in cents. */
export function annualIsr(taxable: number) {
  const bracket = ISR_SCALE.findLast((step) => taxable >= step.from);
  return bracket ? Math.round(bracket.base + (taxable - bracket.from) * bracket.rate) : 0;
}

/** The profit-sharing bonus (bonificación) as the law figures it, in cents. */
export type Bonus = {
  /** The year's average monthly salary, and a day's of it. */
  average: number;
  daily: number;
  days: 45 | 60;
  gross: number;
  isr: number;
  net: number;
};

/**
 * The bonus as the law caps it (art. 223): the year's average monthly
 * salary over 23.83 days, times 45 or 60 days. Its ISR is what it adds on top
 * of the year's taxable income: the salary less the TSS, plus what else the
 * year paid that pays ISR (other bonuses, overtime).
 */
export function legalBonus(months: MonthSalary[], days: 45 | 60, otherTaxable = 0): Bonus {
  const worked = months.filter((month) => month.amount > 0);
  const salary = sum(worked.map((month) => month.amount));
  const average = worked.length > 0 ? salary / worked.length : 0;
  const daily = average / DAYS_A_MONTH;
  const gross = Math.round(daily * days);
  const taxable = salary * (1 - TSS) + otherTaxable;
  const isr = annualIsr(taxable + gross) - annualIsr(taxable);
  return { average: Math.round(average), daily: Math.round(daily), days, gross, isr, net: gross - isr };
}
