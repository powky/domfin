import { useMemo } from 'react';

import {
  currentSalary,
  earliestMonth,
  payByMonth,
  salaryReader,
  type CurrentSalary,
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
  /** The stubs of the month shown or, without any, of the latest month with stubs. */
  breakdown?: MonthPay;
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
  return {
    status,
    settings,
    pay,
    read,
    current: earliest ? currentSalary(read, month, earliest) : undefined,
    breakdown: pay.find((other) => other.month === month) ?? pay.filter((other) => other.month <= month).at(-1),
  };
}
