import type { Extra } from '../types';
import type { MonthSalary } from './salary';
import { TSS_RATE, annualIsr } from './tax';

/** The days a month's salary is divided by for a day's: the Ministerio de Trabajo's 23.83. */
export const DAYS_A_MONTH = 23.83;

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const pad = (month: number) => String(month).padStart(2, '0');

/**
 * The Christmas salary (Código de Trabajo, art. 219): a twelfth of the salary
 * earned in the year, paid in December. It pays no ISR up to that (art. 222)
 * nor TSS.
 */
export const christmasSalary = (months: MonthSalary[]) => Math.round(sum(months.map((month) => month.amount)) / 12);

/** The days of salary the law's bonus is (art. 223): 60 once the job is three years old when it's paid, 45 before. */
export function bonusDays(hiredOn: string, paidOn: string): 45 | 60 {
  const [year, ...rest] = hiredOn.split('-');
  return paidOn >= [Number(year) + 3, ...rest].join('-') ? 60 : 45;
}

/** What an extra payment comes to, in cents: its salary base and days when it has them. */
export type ExtraPayment =
  | { extra: Extra; status: 'ready'; base?: number; days?: number; gross: number; isr: number; net: number }
  | { extra: Extra; status: 'needsHireDate' };

/**
 * What each extra payment of a year comes to, in the order they're paid.
 * Days of salary are the base over 23.83 times the days (45 or 60 by
 * seniority, for the law's bonus); salaries, the base times them; and the
 * base is the year's average salary or the one of the month it's paid. The
 * ISR follows the DGII's scale on top of the year's taxable income so far
 * (the salary less the TSS, what else the year paid that pays ISR, the
 * extras paid before), a flat rate, or there's none.
 */
export function extraPayments(
  extras: Extra[],
  months: MonthSalary[],
  { year, hiredOn, otherTaxable = 0 }: { year: number; hiredOn?: string; otherTaxable?: number },
): ExtraPayment[] {
  const worked = months.filter((month) => month.amount > 0);
  const salary = sum(worked.map((month) => month.amount));
  const average = worked.length > 0 ? salary / worked.length : 0;
  let taxable = salary * (1 - TSS_RATE) + otherTaxable;

  return [...extras]
    .sort((a, b) => a.month - b.month)
    .map((extra): ExtraPayment => {
      const base = extra.base === 'month' ? (months[extra.month - 1]?.amount ?? 0) : average;
      let gross: number;
      let days: number | undefined;
      if (extra.kind === 'fixed') {
        gross = extra.amount ?? 0;
      } else if (extra.kind === 'salaries') {
        gross = Math.round(base * (extra.value ?? 0));
      } else {
        if (extra.seniority && !hiredOn) return { extra, status: 'needsHireDate' };
        days = extra.seniority && hiredOn ? bonusDays(hiredOn, `${year}-${pad(extra.month)}-31`) : (extra.value ?? 0);
        gross = Math.round((base / DAYS_A_MONTH) * days);
      }
      const isr =
        extra.tax === 'scale'
          ? annualIsr(taxable + gross) - annualIsr(taxable)
          : extra.tax === 'rate'
            ? Math.round(gross * (extra.rate ?? 0))
            : 0;
      if (extra.tax !== 'none') taxable += gross;
      return {
        extra,
        status: 'ready',
        base: extra.kind === 'fixed' ? undefined : Math.round(base),
        days,
        gross,
        isr,
        net: gross - isr,
      };
    });
}
