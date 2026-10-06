import type { DeductionKind, PayKind, Payslip, SalaryEntry } from '../types';

const payKinds = ['salary', 'overtime', 'bonus', 'christmas', 'benefit', 'other'] as const satisfies readonly PayKind[];
const deductionKinds = ['isr', 'afp', 'sfs', 'other'] as const satisfies readonly DeductionKind[];

/** A month's pay from its stubs, in cents: what they paid and took by kind, and what reached the account. */
export type MonthPay = {
  /** `YYYY-MM` */
  month: string;
  pay: Record<PayKind, number>;
  deductions: Record<DeductionKind, number>;
  net: number;
  /** Stubs that paid salary in the month: two with a fortnightly payroll. */
  salaryPayments: number;
};

const zeros = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;

/** Each month the stubs cover, oldest first. */
export function payByMonth(payslips: Payslip[]): MonthPay[] {
  const months = new Map<string, MonthPay>();
  for (const slip of payslips) {
    const month = slip.paidOn.slice(0, 7);
    let entry = months.get(month);
    if (!entry) {
      entry = { month, pay: zeros(payKinds), deductions: zeros(deductionKinds), net: 0, salaryPayments: 0 };
      months.set(month, entry);
    }
    entry.net += slip.net;
    let salary = false;
    for (const line of slip.lines) {
      if (line.deduction) {
        entry.deductions[(deductionKinds as readonly string[]).includes(line.kind) ? (line.kind as DeductionKind) : 'other'] +=
          line.amount;
      } else {
        entry.pay[(payKinds as readonly string[]).includes(line.kind) ? (line.kind as PayKind) : 'other'] += line.amount;
        salary ||= line.kind === 'salary';
      }
    }
    if (salary) entry.salaryPayments += 1;
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * A month's gross salary, in cents, and where it comes from: its stubs or a
 * salary set by hand. `estimated` when no stub covers the month and it
 * repeats the nearest one known; `none` before the job started or when
 * nothing is known.
 */
export type MonthSalary = {
  month: string;
  amount: number;
  source: 'payslips' | 'manual' | 'none';
  estimated?: boolean;
};

/**
 * Reads the gross salary of any month: what the stubs paid in a month they
 * cover whole (as many salary payments as the fullest month), else the
 * salary set by hand from that month on, unless a later stub says
 * otherwise, else the last month known before it or, failing that, the
 * first after. Months before the job started earn nothing.
 */
export function salaryReader(pay: MonthPay[], entries: SalaryEntry[], hiredOn?: string) {
  const full = Math.max(0, ...pay.map((month) => month.salaryPayments));
  const stubs = pay.filter((month) => full > 0 && month.salaryPayments >= full);
  const ordered = [...entries].sort((a, b) => a.since.localeCompare(b.since));
  const hired = hiredOn?.slice(0, 7);

  return (month: string): MonthSalary => {
    if (hired && month < hired) return { month, amount: 0, source: 'none' };
    const stub = stubs.find((other) => other.month === month);
    if (stub) return { month, amount: stub.pay.salary, source: 'payslips' };

    const entry = ordered.filter((other) => other.since <= month).at(-1);
    const previous = stubs.filter((other) => other.month < month).at(-1);
    if (entry && (!previous || previous.month < entry.since)) return { month, amount: entry.amount, source: 'manual' };
    if (previous) return { month, amount: previous.pay.salary, source: 'payslips', estimated: true };

    const later = [
      ...stubs.filter((other) => other.month > month).map((other) => ({ month: other.month, amount: other.pay.salary, source: 'payslips' as const })),
      ...ordered.filter((other) => other.since > month).map((other) => ({ month: other.since, amount: other.amount, source: 'manual' as const })),
    ].sort((a, b) => a.month.localeCompare(b.month))[0];
    return later ? { month, amount: later.amount, source: later.source, estimated: true } : { month, amount: 0, source: 'none' };
  };
}

/** The month before a 'YYYY-MM' one. (Not lib/dates, which loads React Native, so the tests can run.) */
function previousMonth(key: string) {
  const [year, month] = key.split('-').map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
}

/** The twelve months of a year, as 'YYYY-MM'. */
export const monthsOf = (year: number) => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

/** The gross salary of each month of a year, January first. */
export const salaryByMonth = (year: number, read: (month: string) => MonthSalary) => monthsOf(year).map(read);

/** The salary in a month, and the month it's been that much since: "RD$90,000.00 since July 2026". */
export type CurrentSalary = { amount: number; since: string; source: 'payslips' | 'manual' };

/** The salary in `month` and since when it's been that, going back no further than `earliest`. */
export function currentSalary(read: (month: string) => MonthSalary, month: string, earliest: string): CurrentSalary | undefined {
  const now = read(month);
  if (now.source === 'none' || now.amount <= 0) return undefined;
  let since = month;
  while (since > earliest) {
    const before = read(previousMonth(since));
    if (before.source === 'none' || before.amount !== now.amount) break;
    since = previousMonth(since);
  }
  return { amount: now.amount, since, source: now.source };
}

/** The first month with no stub paying all its salary: where a salary set by hand starts to count. */
export function firstUnpaidMonth(pay: MonthPay[]): string | undefined {
  const full = Math.max(0, ...pay.map((month) => month.salaryPayments));
  const last = pay.filter((month) => full > 0 && month.salaryPayments >= full).at(-1);
  if (!last) return undefined;
  const [year, month] = last.month.split('-').map(Number);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** The first month anything is known of the salary: the first stub's, or the first salary set by hand. */
export function earliestMonth(pay: MonthPay[], entries: SalaryEntry[]): string | undefined {
  return [...pay.map((month) => month.month), ...entries.map((entry) => entry.since)].sort()[0];
}

/** What a year's stubs paid and took, by kind, in cents. */
export function yearPay(pay: MonthPay[], year: number): Pick<MonthPay, 'pay' | 'deductions' | 'net'> {
  const total = { pay: zeros(payKinds), deductions: zeros(deductionKinds), net: 0 };
  for (const month of pay.filter((other) => other.month.startsWith(`${year}-`))) {
    for (const kind of payKinds) total.pay[kind] += month.pay[kind];
    for (const kind of deductionKinds) total.deductions[kind] += month.deductions[kind];
    total.net += month.net;
  }
  return total;
}
