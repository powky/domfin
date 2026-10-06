/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { MonthSalary } from './salary';
import { annualIsr, bonusDays, christmasSalary, legalBonus } from './yearEnd';

/** Six months at one salary and six at another, in cents. */
const year = (first: number, second: number): MonthSalary[] =>
  Array.from({ length: 12 }, (_, i) => ({
    month: `2026-${String(i + 1).padStart(2, '0')}`,
    amount: i < 6 ? first : second,
    source: 'payslips',
  }));

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

describe('legalBonus', () => {
  it('is the average monthly salary over 23.83 days, times the days, less the ISR it adds', () => {
    const bonus = legalBonus(year(10_000_000, 11_000_000), 60);
    assert.equal(bonus.average, 10_500_000);
    assert.equal(bonus.gross, Math.round((10_500_000 / 23.83) * 60));
    // Well into the top bracket, all of it pays 25%.
    assert.ok(Math.abs(bonus.isr - bonus.gross * 0.25) <= 1);
    assert.equal(bonus.net, bonus.gross - bonus.isr);
  });

  it('pays what its bracket says on a smaller salary', () => {
    const bonus = legalBonus(year(4_000_000, 4_000_000), 45);
    assert.equal(bonus.gross, Math.round((4_000_000 / 23.83) * 45));
    assert.ok(Math.abs(bonus.isr - bonus.gross * 0.15) <= 1);
  });

  it('counts the other bonuses of the year toward its bracket', () => {
    const alone = legalBonus(year(4_000_000, 4_000_000), 45);
    const after = legalBonus(year(4_000_000, 4_000_000), 45, 50_000_000);
    assert.ok(after.isr > alone.isr);
  });
});
