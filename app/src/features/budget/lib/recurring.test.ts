/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { LedgerMovement } from '@/features/ledger/types';

import { monthPlan, plannedIncome } from './plan';
import { addMonths, findRecurring, indexPayments, nameOf, payeeOf, statusIn } from './recurring';

let next = 0;

/** A movement of the payroll account, a peso expense unless told otherwise. */
function movement(date: string, description: string, amount: number, extra: Partial<LedgerMovement> = {}): LedgerMovement {
  next += 1;
  return {
    id: `m${next}`,
    accountId: 'popular:savings:1234:DOP',
    date,
    description,
    amount,
    currency: 'DOP',
    flow: 'expense',
    categoryId: null,
    by: 'default',
    review: false,
    ...extra,
  };
}

/** The months from `first`, `count` of them. */
const months = (first: string, count: number) => Array.from({ length: count }, (_, n) => addMonths(first, n));

/** A payment on `day` of each month, of `amount` (or what `amountOf` says that month). */
const monthly = (
  first: string,
  count: number,
  day: number,
  description: string,
  amountOf: number | ((index: number) => number),
  extra: Partial<LedgerMovement> = {},
) =>
  months(first, count).map((month, index) =>
    movement(`${month}-${String(day).padStart(2, '0')}`, description, typeof amountOf === 'number' ? amountOf : amountOf(index), extra),
  );

const names = (found: { name: string }[]) => found.map((payment) => payment.name).sort();

describe('payeeOf', () => {
  it('leaves out the numbers that change every month', () => {
    assert.equal(payeeOf({ description: 'PAG CLARO 8095550100 000456' }), 'PAG CLARO');
    assert.equal(payeeOf({ description: 'PAG CLARO 8095550100 000789' }), 'PAG CLARO');
    assert.equal(payeeOf({ description: 'MB a 0000000123 Inmobiliaria del Éste' }), 'MB A INMOBILIARIA DEL ESTE');
    assert.equal(payeeOf({ merchant: 'NETFLIX.COM', description: 'NETFLIX.COM  LOS GATOS' }), 'NETFLIX COM');
    assert.equal(payeeOf({ description: '0000123 4567' }), '');
  });

  it('names a payee as the bank wrote it', () => {
    assert.equal(nameOf({ description: 'MB a 0000000123 INMOBILIARIA DEL ESTE' }), 'MB a INMOBILIARIA DEL ESTE');
    assert.equal(nameOf({ merchant: 'APPLE.COM/BILL', description: 'APPLE.COM/BILL  CUPERTINO' }), 'APPLE.COM/BILL');
  });
});

describe('findRecurring', () => {
  const through = '2026-09-30';

  it('finds bills, subscriptions and the rent, monthly', () => {
    const found = findRecurring(
      [
        ...monthly('2026-01', 9, 3, 'PAG CLARO 8095550100 000456', -245_000, { categoryId: 'telecom' }),
        ...monthly('2026-01', 9, 2, 'PAG EDESUR 0000123456', (n) => -(240_000 + ((n * 7) % 9) * 21_000), { categoryId: 'utilities' }),
        ...monthly('2026-01', 9, 6, 'MB a 0000000123 INMOBILIARIA DEL ESTE', -3_200_000),
        ...monthly('2026-03', 7, 28, 'NETFLIX.COM  LOS GATOS', -1_549, {
          merchant: 'NETFLIX.COM',
          currency: 'USD',
          accountId: 'popular:credit_card:5678:USD',
          categoryId: 'subscriptions',
        }),
      ],
      through,
    );
    assert.deepEqual(names(found), ['MB a INMOBILIARIA DEL ESTE', 'NETFLIX.COM', 'PAG CLARO', 'PAG EDESUR']);

    const claro = found.find((payment) => payment.match === 'PAG CLARO');
    assert.equal(claro?.amount, 245_000);
    assert.equal(claro?.day, 3);
    assert.equal(claro?.categoryId, 'telecom');
    assert.equal(claro?.monthsPaid, 9);
    assert.equal(claro?.variable, false);

    assert.equal(found.find((payment) => payment.match === 'PAG EDESUR')?.variable, true);
    const netflix = found.find((payment) => payment.match === 'NETFLIX COM');
    assert.equal(netflix?.currency, 'USD');
    assert.equal(netflix?.accountId, 'popular:credit_card:5678:USD');
  });

  it("leaves out what's variable, sporadic, too new or no longer paid", () => {
    const found = findRecurring(
      [
        // Four times a month: the supermarket.
        ...months('2026-01', 9).flatMap((month) =>
          [3, 10, 17, 24].map((day) => movement(`${month}-${day}`, 'SUPERMERCADO LA COLONIA', -520_000)),
        ),
        // Once a month, but groceries are never fixed.
        ...monthly('2026-01', 9, 12, 'MERCADO FRESCO', -300_000, { categoryId: 'groceries' }),
        // The tax withheld from the interest: the bank takes it, you don't pay it.
        ...monthly('2026-01', 9, 30, 'RETENCION DGII', -16_426, { categoryId: 'withholding' }),
        // Three of eight months.
        ...['2026-02', '2026-05', '2026-09'].map((month) => movement(`${month}-15`, 'CINE PALACIO', -90_000)),
        // Only twice.
        ...monthly('2026-08', 2, 9, 'CURSO DE COCINA', -450_000),
        // Paid until June, cancelled.
        ...monthly('2026-01', 6, 20, 'REVISTA DIGITAL', -60_000),
        // Wildly different every month.
        ...monthly('2026-01', 9, 8, 'FERRETERIA EL MARTILLO', (n) => -[50_000, 900_000, 120_000, 2_000_000, 75_000, 640_000, 30_000, 1_500_000, 220_000][n]),
        // Paying the card is a transfer, not a cost.
        ...monthly('2026-01', 9, 10, 'PAGO TARJETA 5678', -1_850_000, { flow: 'transfer', categoryId: 'card-payment' }),
        // Money in.
        ...monthly('2026-01', 9, 15, 'CREDITO NOMINA', 5_850_000, { flow: 'income', categoryId: 'salary' }),
      ],
      through,
    );
    assert.deepEqual(names(found), []);
  });

  it("counts an installment set aside into an asset, and forgives a missed month", () => {
    const found = findRecurring(
      [
        ...monthly('2026-01', 9, 25, 'FIDEICOMISO TORRE LAS PALMAS', -200_000, {
          flow: 'transfer',
          categoryId: 'investment-in',
          currency: 'USD',
        }),
        // Missed in May.
        ...monthly('2026-01', 9, 14, 'GIMNASIO POWER FIT', -280_000, { categoryId: 'fitness' }).filter(
          (payment) => !payment.date.startsWith('2026-05'),
        ),
      ],
      through,
    );
    assert.deepEqual(names(found), ['FIDEICOMISO TORRE LAS PALMAS', 'GIMNASIO POWER FIT']);
    const gym = found.find((payment) => payment.match === 'GIMNASIO POWER FIT');
    assert.equal(gym?.monthsPaid, 8);
    assert.equal(gym?.monthsConsidered, 9);
  });

  it('counts the month in course when the statements stop before its end', () => {
    // Statements until October 10: September is the last complete month.
    const payments = [
      ...monthly('2026-07', 3, 3, 'PAG CLARO 8095550100', -245_000),
      movement('2026-10-03', 'PAG CLARO 8095550100', -245_000),
    ];
    const [claro] = findRecurring(payments, '2026-10-10');
    assert.equal(claro.monthsPaid, 4);
    assert.equal(claro.monthsConsidered, 4);
    assert.equal(claro.lastDate, '2026-10-03');
  });
});

describe('statusIn', () => {
  const index = indexPayments([
    movement('2026-09-03', 'PAG CLARO 8095550100', -245_000),
    // A refund lowers what was paid.
    movement('2026-09-12', 'PAG CLARO 8095550100', 45_000),
  ]);
  const claro = { match: 'PAG CLARO', currency: 'DOP' as const, day: 3 };

  it('says what was paid, when', () => {
    assert.deepEqual(statusIn(index, claro, '2026-09', '2026-09-30'), { kind: 'paid', amount: 200_000, date: '2026-09-03' });
  });

  it("waits for the statements that reach its day before calling it missing", () => {
    assert.deepEqual(statusIn(index, claro, '2026-10', '2026-09-30'), { kind: 'due', date: '2026-10-03' });
    assert.deepEqual(statusIn(index, claro, '2026-10', '2026-10-07'), { kind: 'due', date: '2026-10-03' });
    assert.deepEqual(statusIn(index, claro, '2026-10', '2026-10-08'), { kind: 'missing', date: '2026-10-03' });
    // Without a day, the end of the month.
    assert.deepEqual(statusIn(index, { ...claro, day: undefined }, '2026-02', '2026-02-20'), { kind: 'due', date: '2026-02-28' });
  });

  it('has nothing to follow for one added by hand', () => {
    assert.deepEqual(statusIn(index, { currency: 'DOP' }, '2026-09', '2026-09-30'), { kind: 'manual' });
  });
});

describe('plannedIncome and monthPlan', () => {
  const movements = [
    ...monthly('2026-06', 4, 15, 'CREDITO NOMINA', 5_850_000, { flow: 'income', categoryId: 'salary' }),
    ...monthly('2026-06', 4, 28, 'CREDITO NOMINA', 5_850_000, { flow: 'income', categoryId: 'salary' }),
    movement('2026-09-20', 'CREDITO NOMINA', 9_000_000, { flow: 'income', categoryId: 'extra-income' }),
    ...monthly('2026-06', 4, 3, 'PAG CLARO 8095550100', -245_000, { categoryId: 'telecom' }),
    movement('2026-09-08', 'SUPERMERCADO LA COLONIA', -1_000_000, { categoryId: 'groceries' }),
    movement('2026-09-09', 'SUPERMERCADO LA COLONIA', 100_000, { categoryId: 'groceries' }),
  ];
  const valueOf = (payment: LedgerMovement) => payment.amount;
  const toDisplay = (amount: number, currency: string) => (currency === 'USD' ? amount * 60 : amount);

  it('plans with the salary, or with the income you set', () => {
    assert.deepEqual(plannedIncome(movements, '2026-09-30', valueOf, toDisplay), { amount: 11_700_000, source: 'salary' });
    assert.deepEqual(plannedIncome(movements, '2026-09-30', valueOf, toDisplay, { amount: 2_000_000, currency: 'USD' }), {
      amount: 120_000_000,
      source: 'set',
    });
    assert.deepEqual(plannedIncome([], '2026-09-30', valueOf, toDisplay), { amount: 0, source: 'none' });
  });

  it('adds up the fixed costs, what was paid and what is left after the rest', () => {
    const items = [
      { id: 'claro', name: 'Claro', match: 'PAG CLARO', amount: 245_000, currency: 'DOP' as const, day: 3 },
      { id: 'spotify', name: 'Spotify', match: 'SPOTIFY', amount: 1_099, currency: 'USD' as const, day: 20 },
      { id: 'empleada', name: 'Empleada', amount: 1_200_000, currency: 'DOP' as const },
    ];
    const plan = monthPlan({
      movements,
      index: indexPayments(movements),
      items,
      month: '2026-09',
      throughOf: () => '2026-09-30',
      today: '2026-09-15',
      valueOf,
      toDisplay,
      income: { amount: 11_700_000, source: 'salary' },
    });
    assert.equal(plan.fixed, 245_000 + 65_940 + 1_200_000);
    assert.equal(plan.fixedPaid, 245_000);
    // Spotify didn't show up, and the one added by hand is counted as pending.
    assert.equal(plan.fixedPending, 65_940 + 1_200_000);
    // The supermarket, less what it gave back; Claro is a fixed cost.
    assert.equal(plan.variable, 900_000);
    assert.equal(plan.received, 11_700_000 + 9_000_000);
    assert.equal(plan.left, 11_700_000 - 245_000 - 65_940 - 1_200_000 - 900_000);
    assert.deepEqual(
      plan.items.map((row) => row.status.kind),
      ['paid', 'missing', 'manual'],
    );

    // Once its day has come, the one added by hand counts as paid.
    const later = monthPlan({
      movements,
      index: indexPayments(movements),
      items,
      month: '2026-09',
      throughOf: () => '2026-09-30',
      today: '2026-10-05',
      valueOf,
      toDisplay,
      income: { amount: 11_700_000, source: 'salary' },
    });
    assert.equal(later.fixedPaid, 245_000 + 1_200_000);
    assert.equal(later.fixedPending, 65_940);
  });
});
