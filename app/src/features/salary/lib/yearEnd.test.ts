/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Extra } from '../types';
import type { MonthSalary } from './salary';
import { annualIsr, deductionsByLaw } from './tax';
import { bonusDays, christmasSalary, extraPayments } from './yearEnd';

/** Six months at one salary and six at another, in cents. */
const year = (first: number, second: number): MonthSalary[] =>
  Array.from({ length: 12 }, (_, i) => ({
    month: `2026-${String(i + 1).padStart(2, '0')}`,
    amount: i < 6 ? first : second,
    source: 'payslips',
  }));

const extra = (fields: Partial<Extra>): Extra => ({ id: 'x', name: 'Bono', month: 12, kind: 'fixed', tax: 'none', ...fields });

describe('christmasSalary', () => {
  it("is a twelfth of the year's salary", () => {
    assert.equal(christmasSalary(year(10_000_000, 11_000_000)), 10_500_000);
  });

  it('counts only the months worked', () => {
    const months = year(0, 12_000_000).map((m) => (m.amount === 0 ? { ...m, source: 'none' as const } : m));
    assert.equal(christmasSalary(months), 6_000_000);
  });
});

describe('bonusDays', () => {
  it('is 60 days once the job is three years old when the bonus is paid, 45 before', () => {
    assert.equal(bonusDays('2023-12-20', '2026-12-20'), 60);
    assert.equal(bonusDays('2023-12-20', '2026-12-19'), 45);
  });
});

describe('annualIsr', () => {
  it("follows the DGII's 2026 scale", () => {
    assert.equal(annualIsr(40_000_000), 0);
    assert.equal(annualIsr(50_000_000), Math.round((50_000_000 - 41_622_001) * 0.15));
    assert.equal(annualIsr(70_000_000), Math.round(3_121_600 + (70_000_000 - 62_432_901) * 0.2));
    assert.equal(annualIsr(100_000_000), Math.round(7_977_600 + (100_000_000 - 86_712_301) * 0.25));
  });
});

describe('deductionsByLaw', () => {
  it('takes the AFP and SFS from the salary and a twelfth of the yearly ISR, less the TSS', () => {
    const law = deductionsByLaw(10_000_000);
    assert.equal(law.afp, 287_000);
    assert.equal(law.sfs, 304_000);
    assert.equal(law.isr, Math.round(annualIsr(10_000_000 * 12 * (1 - 0.0591)) / 12));
  });

  it('takes no ISR from a salary under the exempt bracket', () => {
    assert.equal(deductionsByLaw(3_000_000).isr, 0);
  });
});

describe('extraPayments', () => {
  const months = year(10_000_000, 11_000_000);

  it("figures the law's bonus by seniority on the average salary, with the ISR it adds", () => {
    const [bonus] = extraPayments([extra({ kind: 'days', seniority: true, base: 'average', tax: 'scale' })], months, {
      year: 2026,
      hiredOn: '2020-03-15',
    });
    assert.equal(bonus.status, 'ready');
    if (bonus.status !== 'ready') return;
    assert.equal(bonus.days, 60);
    assert.equal(bonus.base, 10_500_000);
    assert.equal(bonus.gross, Math.round((10_500_000 / 23.83) * 60));
    // Well into the top bracket, all of it pays 25%.
    assert.ok(Math.abs(bonus.isr - bonus.gross * 0.25) <= 1);
    assert.equal(bonus.net, bonus.gross - bonus.isr);
  });

  it('asks for the day the job started before it can count days by seniority', () => {
    const [bonus] = extraPayments([extra({ kind: 'days', seniority: true, tax: 'scale' })], months, { year: 2026 });
    assert.equal(bonus.status, 'needsHireDate');
  });

  it("pays salaries on the month's, a flat rate of ISR, or a fixed amount with none", () => {
    const [school, performance] = extraPayments(
      [
        extra({ id: 'b', month: 7, kind: 'salaries', value: 1.5, base: 'month', tax: 'rate', rate: 0.2 }),
        extra({ id: 'a', month: 3, kind: 'fixed', amount: 2_000_000, tax: 'none' }),
      ],
      months,
      { year: 2026 },
    );
    // In the order they're paid.
    assert.deepEqual([school.extra.id, performance.extra.id], ['a', 'b']);
    assert.ok(school.status === 'ready' && school.gross === 2_000_000 && school.isr === 0 && school.net === 2_000_000);
    assert.ok(performance.status === 'ready');
    if (performance.status !== 'ready') return;
    assert.equal(performance.gross, 16_500_000);
    assert.equal(performance.isr, 3_300_000);
  });

  it('counts what was paid before toward the bracket of what comes after', () => {
    const small = year(3_000_000, 3_000_000);
    const alone = extraPayments([extra({ kind: 'fixed', amount: 10_000_000, tax: 'scale' })], small, { year: 2026 })[0];
    const after = extraPayments(
      [extra({ id: 'first', month: 6, kind: 'fixed', amount: 30_000_000, tax: 'scale' }), extra({ kind: 'fixed', amount: 10_000_000, tax: 'scale' })],
      small,
      { year: 2026 },
    )[1];
    assert.ok(alone.status === 'ready' && after.status === 'ready' && after.isr > alone.isr);
  });
});
