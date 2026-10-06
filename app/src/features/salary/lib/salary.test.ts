/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Payslip, PayslipLine } from '../types';
import {
  breakdownFor,
  currentSalary,
  firstUnpaidMonth,
  payByMonth,
  salaryByMonth,
  salaryReader,
  yearDeductions,
  yearPay,
  type MonthPay,
} from './salary';

let next = 0;

/** A made-up stub; amounts in cents. */
function stub(paidOn: string, lines: PayslipLine[]): Payslip {
  next += 1;
  const net = lines.reduce((total, line) => total + (line.deduction ? -line.amount : line.amount), 0);
  return { id: next, employer: 'EMPRESA DE PRUEBA', paidOn, net, status: 'ok', lines };
}

const salary = (amount: number): PayslipLine => ({ concept: 'SUELDO', kind: 'salary', amount, yearToDate: 0 });
const isr = (amount: number): PayslipLine => ({ concept: 'LEY 11-92', kind: 'isr', deduction: true, amount, yearToDate: 0 });

/** A month paid in two fortnights of half the salary each, the second with its ISR. */
const month = (key: string, monthly: number) => [
  stub(`${key}-12`, [salary(monthly / 2)]),
  stub(`${key}-27`, [salary(monthly / 2), isr(monthly / 10)]),
];

describe('payByMonth', () => {
  it('adds up each month by kind, counting the stubs that paid salary', () => {
    const pay = payByMonth([
      ...month('2026-03', 10_000_000),
      stub('2026-03-06', [{ concept: 'BONIFICACION', kind: 'bonus', amount: 30_000_000, yearToDate: 0 }, isr(7_500_000)]),
      stub('2026-03-01', [{ concept: 'FLOTILLA', kind: 'benefit', amount: 300_000, yearToDate: 0 }]),
      stub('2026-03-12', [{ concept: 'CAFETERIA', kind: 'other', deduction: true, amount: 50_000, yearToDate: 0 }]),
    ]);
    assert.equal(pay.length, 1);
    const [march] = pay;
    assert.equal(march.salaryPayments, 2);
    assert.deepEqual(march.pay, { salary: 10_000_000, overtime: 0, bonus: 30_000_000, christmas: 0, benefit: 300_000, other: 0 });
    assert.deepEqual(march.deductions, { isr: 8_500_000, afp: 0, sfs: 0, other: 50_000 });
    assert.equal(march.net, 10_000_000 + 30_000_000 + 300_000 - 8_500_000 - 50_000);
  });
});

describe('salaryReader', () => {
  const pay: MonthPay[] = payByMonth([
    ...month('2026-01', 10_000_000),
    ...month('2026-02', 10_000_000),
    ...month('2026-04', 11_000_000),
    // June has only its first fortnight so far.
    stub('2026-06-12', [salary(5_500_000)]),
  ]);

  it('takes the months the stubs cover whole, and repeats the last one known after', () => {
    const months = salaryByMonth(2026, salaryReader(pay, []));
    assert.deepEqual(
      months.slice(0, 7).map((m) => [m.month, m.amount, m.source, m.estimated ?? false]),
      [
        ['2026-01', 10_000_000, 'payslips', false],
        ['2026-02', 10_000_000, 'payslips', false],
        ['2026-03', 10_000_000, 'payslips', true],
        ['2026-04', 11_000_000, 'payslips', false],
        ['2026-05', 11_000_000, 'payslips', true],
        ['2026-06', 11_000_000, 'payslips', true],
        ['2026-07', 11_000_000, 'payslips', true],
      ],
    );
  });

  it('uses a salary set by hand from its month on, until a stub says otherwise', () => {
    const read = salaryReader(pay, [
      { since: '2026-01', amount: 9_000_000, currency: 'DOP' },
      { since: '2026-11', amount: 12_000_000, currency: 'DOP' },
    ]);
    assert.deepEqual(
      ['2026-01', '2026-05', '2026-10', '2026-11', '2026-12'].map((key) => [read(key).amount, read(key).source]),
      [
        [10_000_000, 'payslips'],
        [11_000_000, 'payslips'],
        [11_000_000, 'payslips'],
        [12_000_000, 'manual'],
        [12_000_000, 'manual'],
      ],
    );
  });

  it('fills the months before the first stub with it, from the day the job started', () => {
    const july = payByMonth(month('2026-07', 8_000_000));
    const read = salaryReader(july, [], '2026-03-15');
    assert.deepEqual(
      ['2026-02', '2026-03', '2026-06', '2026-07'].map((key) => [read(key).amount, read(key).estimated ?? false]),
      [
        [0, false],
        [8_000_000, true],
        [8_000_000, true],
        [8_000_000, false],
      ],
    );
  });

  it('knows nothing without stubs or salaries', () => {
    assert.equal(salaryReader([], [])('2026-05').source, 'none');
  });
});

describe('currentSalary', () => {
  it('says since when the salary has been what it is now', () => {
    const pay = payByMonth([...month('2026-01', 10_000_000), ...month('2026-02', 11_000_000), ...month('2026-03', 11_000_000)]);
    assert.deepEqual(currentSalary(salaryReader(pay, []), '2026-10', '2026-01'), {
      amount: 11_000_000,
      since: '2026-02',
      source: 'payslips',
    });
  });
});

describe('yearPay', () => {
  it("adds up a year's stubs", () => {
    const pay = payByMonth([...month('2025-12', 10_000_000), ...month('2026-01', 10_000_000), ...month('2026-02', 12_000_000)]);
    const year = yearPay(pay, 2026);
    assert.equal(year.pay.salary, 22_000_000);
    assert.equal(year.deductions.isr, 2_200_000);
  });
});

describe('firstUnpaidMonth', () => {
  it('is the month after the last one the stubs pay whole', () => {
    const pay = payByMonth([...month('2026-11', 10_000_000), ...month('2026-12', 10_000_000), stub('2027-01-12', [salary(5_000_000)])]);
    assert.equal(firstUnpaidMonth(pay), '2027-01');
    assert.equal(firstUnpaidMonth([]), undefined);
  });
});

describe('breakdownFor', () => {
  it("shows a salary set by hand with the deductions given, and the law's for the rest", () => {
    const read = salaryReader([], [{ since: '2026-01', amount: 10_000_000, currency: 'DOP', isr: 1_000_000, other: 50_000 }]);
    const breakdown = breakdownFor('2026-05', [], read);
    assert.ok(breakdown);
    assert.equal(breakdown.source, 'manual');
    assert.deepEqual(breakdown.estimated, ['afp', 'sfs']);
    assert.deepEqual(breakdown.deductions, { isr: 1_000_000, afp: 287_000, sfs: 304_000, other: 50_000 });
    assert.equal(breakdown.net, 10_000_000 - 1_000_000 - 287_000 - 304_000 - 50_000);
  });

  it('shows the latest month the stubs pay whole, not one with half of it', () => {
    const pay = payByMonth([...month('2026-08', 10_000_000), ...month('2026-09', 10_000_000), stub('2026-10-01', [salary(5_000_000)])]);
    const breakdown = breakdownFor('2026-10', pay, salaryReader(pay, []));
    assert.equal(breakdown?.month, '2026-09');
    assert.equal(breakdown?.source, 'payslips');
  });

  it('shows a raise set by hand once the stubs end', () => {
    const pay = payByMonth(month('2026-09', 10_000_000));
    const read = salaryReader(pay, [{ since: '2026-11', amount: 12_000_000, currency: 'DOP' }]);
    assert.equal(breakdownFor('2026-10', pay, read)?.source, 'payslips');
    assert.equal(breakdownFor('2026-11', pay, read)?.pay.salary, 12_000_000);
  });
});

describe('yearDeductions', () => {
  it("adds up a salary set by hand's deductions month by month", () => {
    const read = salaryReader([], [{ since: '2026-01', amount: 10_000_000, currency: 'DOP', isr: 1_000_000 }]);
    const year = yearDeductions([], read, '2026-03');
    assert.equal(year.isr, 3_000_000);
    assert.equal(year.afp, 3 * 287_000);
    assert.equal(year.estimated, true);
  });
});
