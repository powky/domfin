import { useMemo } from 'react';

import {
  breakdownFor,
  currentSalary,
  earliestMonth,
  payByMonth,
  salaryReader,
  yearDeductions,
  type CurrentSalary,
  type MonthBreakdown,
  type MonthPay,
  type MonthSalary,
} from '../lib/salary';
import type { SalarySettings } from '../types';
import { usePayslips, useSalarySettings } from './salary';

export type SalaryView = {
  status: 'loading' | 'ready' | 'offline';
  settings: SalarySettings;
  /** Each month the pay stubs cover, oldest first. */
  pay: MonthPay[];
  /** The gross salary of any month. */
  read: (month: string) => MonthSalary;
  /** The salary in the month shown, and since when; none when nothing is known. */
  current?: CurrentSalary;
  /** The pay of the month shown: a salary set by hand's, or the latest month the stubs pay whole. */
  breakdown?: MonthBreakdown;
  /** What the year took in ISR, AFP and SFS up to the breakdown's month; `estimated` when it's by law, not the stubs. */
  yearToDate?: ReturnType<typeof yearDeductions>;
};

/** The salary as of `month` ('YYYY-MM'), from the pay stubs and what was set by hand. */
export function useSalaryView(month: string): SalaryView {
  const payslips = usePayslips();
  const salary = useSalarySettings();
  const settings = salary.value;
  const pay = useMemo(() => payByMonth(payslips.value), [payslips.value]);
  const read = useMemo(() => salaryReader(pay, settings.entries, settings.hiredOn), [pay, settings.entries, settings.hiredOn]);
  const earliest = earliestMonth(pay, settings.entries);
  const status =
    payslips.status === 'ready' && salary.status === 'ready'
      ? 'ready'
      : payslips.status === 'offline' || salary.status === 'offline'
        ? 'offline'
        : 'loading';
  const breakdown = breakdownFor(month, pay, read);
  return {
    status,
    settings,
    pay,
    read,
    current: earliest ? currentSalary(read, month, earliest) : undefined,
    breakdown,
    yearToDate: breakdown ? yearDeductions(pay, read, breakdown.month) : undefined,
  };
}
