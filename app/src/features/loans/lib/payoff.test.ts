/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { addMonths, loanHistory, nextInstallment, paidShare, payoff } from './payoff';

describe('payoff', () => {
  it('ends a five-year loan in sixty installments', () => {
    // RD$100,000 at 12% a year, paid at RD$2,224.44 a month.
    const result = payoff(10_000_000, { rate: 0.12, installment: 222_444 }, '2026-11');
    assert.equal(result.status, 'ends');
    if (result.status !== 'ends') return;
    assert.equal(result.payments, 60);
    assert.equal(result.first, '2026-11');
    assert.equal(result.last, '2031-10');
    assert.equal(result.interest, 3_346_683);
    assert.equal(result.total, 13_346_683);
    // The last one takes the cents rounding left: no installment of 43 cents.
    assert.equal(result.lastAmount, 222_487);
    assert.equal(result.yours, result.total);
    assert.equal(result.theirs, 0);
    assert.deepEqual(
      result.years.map((year) => year.year),
      ['2026', '2027', '2028', '2029', '2030', '2031'],
    );
    assert.equal(result.years.at(-1)?.balance, 0);
    assert.equal(
      result.years.reduce((sum, year) => sum + year.principal, 0),
      10_000_000,
    );
  });

  it('splits what someone else pays of each installment', () => {
    const result = payoff(250_000, { rate: 0, installment: 100_000, subsidy: 60_000 }, '2026-11');
    assert.equal(result.status, 'ends');
    if (result.status !== 'ends') return;
    assert.equal(result.payments, 3);
    assert.equal(result.lastAmount, 50_000);
    // They pay 60,000 of each, and all of the last one, which is smaller.
    assert.equal(result.theirs, 170_000);
    assert.equal(result.yours, 80_000);
  });

  it('groups what is left by year', () => {
    const result = payoff(400_000, { rate: 0, installment: 100_000 }, '2026-11');
    assert.equal(result.status, 'ends');
    if (result.status !== 'ends') return;
    assert.deepEqual(result.years, [
      { year: '2026', interest: 0, principal: 200_000, balance: 200_000 },
      { year: '2027', interest: 0, principal: 200_000, balance: 0 },
    ]);
    assert.equal(result.last, '2027-02');
  });

  it("says when the installment doesn't cover a month's interest", () => {
    // 2% a month of RD$100,000 is RD$2,000: an installment of 2,000 never lowers it.
    assert.deepEqual(payoff(10_000_000, { rate: 0.24, installment: 200_000 }, '2026-11'), {
      status: 'never',
      interest: 200_000,
    });
    // Barely above it, at 2% a month the capital paid grows fast enough to end in about 51 years…
    assert.equal(payoff(10_000_000, { rate: 0.24, installment: 200_001 }, '2026-11').status, 'ends');
    // …but at 1% a year it would take more than a hundred.
    assert.equal(payoff(10_000_000, { rate: 0.01, installment: 8_334 }, '2026-11').status, 'never');
  });

  it('has nothing left of a loan already paid', () => {
    assert.deepEqual(payoff(0, { rate: 0.1, installment: 1 }, '2026-11'), { status: 'paid' });
  });
});

describe("a loan's history", () => {
  it('adds up what was lent and paid, capital apart from interest and charges', () => {
    const history = loanHistory([
      { date: '2026-01-15', amount: -10_000_000, kind: 'disbursement', principal: 10_000_000 },
      { date: '2026-02-15', amount: 100_000, kind: 'payment', principal: 40_000 },
      { date: '2026-03-15', amount: 100_000, kind: 'payment', principal: 41_000 },
      // The first payment of a history that starts later: its split is unknown.
      { date: '2026-04-15', amount: 100_000, kind: 'payment' },
      { date: '2026-05-02', amount: 9_919_000, kind: 'payoff', principal: 9_919_000 },
    ]);
    assert.deepEqual(history, {
      disbursed: 10_000_000,
      paid: 10_219_000,
      principalPaid: 10_000_000,
      interestPaid: 119_000,
      lastPayment: { date: '2026-04-15', amount: 100_000 },
    });
  });

  it('starts the next installment after the latest payment, not before the balance', () => {
    assert.equal(nextInstallment('2026-09-30', '2026-09-10'), '2026-10');
    assert.equal(nextInstallment('2026-09-30', '2026-06-10'), '2026-09');
    assert.equal(nextInstallment('2026-09-30'), '2026-10');
  });

  it('tells how much of the capital is paid', () => {
    const base = { disbursed: 0, paid: 0, principalPaid: 0, interestPaid: 0 };
    assert.equal(paidShare(6_000_000, { ...base, disbursed: 10_000_000 }), 0.4);
    // The history starts after the disbursement: what's owed plus what's been paid of it.
    assert.equal(paidShare(3_000_000, { ...base, principalPaid: 1_000_000 }), 0.25);
    assert.equal(paidShare(3_000_000, base), 0);
    assert.equal(paidShare(0, base), undefined);
  });

  it('counts months across years', () => {
    assert.equal(addMonths('2026-11', 3), '2027-02');
    assert.equal(addMonths('2026-01', -1), '2025-12');
    assert.equal(addMonths('2026-12', 0), '2026-12');
  });
});
