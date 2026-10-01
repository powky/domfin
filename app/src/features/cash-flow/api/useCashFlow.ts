import type { TFunction } from 'i18next';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useLatestStatement } from '@/features/accounts';
import { useConverter, valueInDisplay, type Converter } from '@/features/currency';
import {
  UNCATEGORIZED,
  accountName,
  counterparty,
  groupColor,
  monthlyValues,
  useAssets,
  useLedger,
  useLedgerNames,
  type LedgerAccount,
  type LedgerMovement,
} from '@/features/ledger';
import { sumCents } from '@/lib/currency';
import { monthsInRange, type MonthRange } from '@/lib/period';

import type { CashFlowSummary, ExpenseGroup, FlowItem } from '../types';

const byAmount = (a: FlowItem, b: FlowItem) => b.amount - a.amount;

/**
 * Cash flow for a month range, in the display currency: the ledger's income
 * and expenses. Transfers between your accounts don't count.
 */
export function useCashFlow(range: MonthRange): {
  data: CashFlowSummary;
  status: 'loading' | 'ready' | 'offline';
  latestStatement?: string;
} {
  const converter = useConverter();
  const { t } = useTranslation();
  const ledger = useLedger();
  const names = useLedgerNames(ledger);
  const latestStatement = useLatestStatement();
  const { assets } = useAssets();
  const data = useMemo((): CashFlowSummary => {
    const months = monthsInRange(range);
    /**
     * Totals of `flow` by `keyOf`, positive for money in (income) or out
     * (expenses), each movement at the rate of its date.
     */
    const totals = (flow: 'income' | 'expense', keyOf: (movement: LedgerMovement) => string) =>
      [
        ...monthlyValues(
          ledger.movements.filter((movement) => movement.flow === flow),
          months,
          keyOf,
          (movement) => (flow === 'income' ? 1 : -1) * valueInDisplay(converter, movement),
        ),
      ]
        .map(([key, monthly]) => ({ key, amount: sumCents(monthly) }))
        // Refunds larger than the spending can leave a category below zero.
        .filter((item) => item.amount > 0);
    const categoryOf = (movement: LedgerMovement) => movement.categoryId ?? UNCATEGORIZED;
    const known = (id: string) => (id === UNCATEGORIZED ? null : id);

    const incomeByCategory = totals('income', categoryOf)
      .map(
        ({ key, amount }): FlowItem => ({ id: `income:${key}`, label: names.category(known(key)), amount, color: 'income' }),
      )
      .sort(byAmount);
    const incomeByMerchant = totals('income', counterparty)
      .map(({ key, amount }): FlowItem => ({ id: `payer:${key}`, label: key, amount, color: 'income' }))
      .sort(byAmount);

    const groups = new Map<string, FlowItem[]>();
    for (const { key, amount } of totals('expense', categoryOf)) {
      const groupId = names.groupOf(known(key));
      const category: FlowItem = { id: key, label: names.category(known(key)), amount, color: groupColor(groupId) };
      groups.set(groupId, [...(groups.get(groupId) ?? []), category]);
    }
    const expensesByGroup = [...groups]
      .map(
        ([id, categories]): ExpenseGroup => ({
          id: `group:${id}`,
          label: names.group(id),
          color: groupColor(id),
          amount: sumCents(categories.map((category) => category.amount)),
          categories: categories.sort(byAmount),
        }),
      )
      .sort(byAmount);

    // A merchant takes the color of the group of its latest expense.
    const merchantColor = new Map<string, FlowItem['color']>();
    for (const movement of ledger.movements) {
      const merchant = counterparty(movement);
      if (movement.flow === 'expense' && !merchantColor.has(merchant)) {
        merchantColor.set(merchant, groupColor(names.groupOf(movement.categoryId)));
      }
    }
    const expensesByMerchant = totals('expense', counterparty)
      .map(
        ({ key, amount }): FlowItem => ({
          id: `merchant:${key}`,
          label: key,
          amount,
          color: merchantColor.get(key) ?? 'slateLight',
        }),
      )
      .sort(byAmount);

    const incomeTotal = sumCents(incomeByCategory.map((item) => item.amount));
    const expensesTotal = sumCents(expensesByGroup.map((group) => group.amount));
    const investments = investedByDestination(ledger.movements, ledger.accounts, months, assets, t, converter);
    const invested = [...investments].map(([label, monthly]) => ({ label, amount: sumCents(monthly) }));
    const investedTotal = sumCents(invested.map((item) => item.amount));
    const net = sumCents([incomeTotal, -expensesTotal]);
    // Loans paid into your accounts (the loan's own side of it doesn't count twice).
    const kinds = new Map(ledger.accounts.map((account) => [account.id, account.kind]));
    const disbursements = ledger.movements.filter((movement) => {
      const kind = kinds.get(movement.accountId);
      return movement.categoryId === 'disbursement' && movement.amount > 0 && kind !== undefined && cashKinds.has(kind);
    });
    const borrowed = sumCents(
      [...monthlyValues(disbursements, months, () => 'loans', (movement) => valueInDisplay(converter, movement))].flatMap(
        ([, monthly]) => monthly,
      ),
    );
    return {
      period: { from: `${months[0]}-01`, to: `${months[months.length - 1]}-01` },
      income: { total: incomeTotal, byCategory: incomeByCategory, byMerchant: incomeByMerchant },
      expenses: { total: expensesTotal, byGroup: expensesByGroup, byMerchant: expensesByMerchant },
      net,
      investments: {
        total: investedTotal,
        byDestination: invested
          .filter((item) => item.amount > 0)
          .map(
            (item): FlowItem => ({ id: `investment:${item.label}`, label: item.label, amount: item.amount, color: 'darkGreen' }),
          )
          .sort(byAmount),
      },
      kept: sumCents([net, -investedTotal]),
      borrowed,
    };
  }, [range, ledger.movements, ledger.accounts, names, converter, assets, t]);
  return { data, status: ledger.status, latestStatement };
}

const cashKinds = new Set<LedgerAccount['kind']>(['savings', 'checking', 'credit_card']);
const investmentKinds = new Set<LedgerAccount['kind']>(['certificate', 'brokerage']);

/**
 * What went into investments in `months`, by destination, in units of the
 * display currency: money out of your accounts and cards into investments
 * (minus what came back), and what the investments earned and kept (a
 * certificate's interest, minus its tax).
 */
function investedByDestination(
  movements: readonly LedgerMovement[],
  accounts: readonly LedgerAccount[],
  months: readonly string[],
  assets: readonly { id: string; name: string }[],
  t: TFunction,
  converter: Converter,
) {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const movementsById = new Map(movements.map((movement) => [movement.id, movement]));
  const assetNames = new Map(assets.map((asset) => [asset.id, asset.name]));
  const destination = (movement: LedgerMovement) => {
    if (movement.assetId) return assetNames.get(movement.assetId) ?? t('cashFlow.otherInvestments');
    const other = movement.pairId ? byId.get(movementsById.get(movement.pairId)?.accountId ?? '') : undefined;
    return other ? accountName(other, accounts, t) : t('cashFlow.otherInvestments');
  };
  // Every amount counted as money going into investments: out of your
  // accounts (negative), or kept by an investment (turned negative too).
  const counted: { movement: LedgerMovement; sign: 1 | -1 }[] = [];
  for (const movement of movements) {
    const kind = byId.get(movement.accountId)?.kind;
    if (!kind) continue;
    const contribution = movement.categoryId === 'investment-in' && movement.amount < 0 && cashKinds.has(kind);
    const withdrawal = movement.categoryId === 'investment-out' && movement.amount > 0 && cashKinds.has(kind);
    if (contribution || withdrawal) counted.push({ movement, sign: 1 });
    if (investmentKinds.has(kind) && movement.flow !== 'transfer') counted.push({ movement, sign: -1 });
  }
  const signs = new Map(counted.map(({ movement, sign }) => [movement, sign]));
  const keyOf = (movement: LedgerMovement) => {
    const account = byId.get(movement.accountId);
    // What an investment earned counts under the investment itself.
    return account && investmentKinds.has(account.kind) ? accountName(account, accounts, t) : destination(movement);
  };
  return monthlyValues(
    counted.map(({ movement }) => movement),
    months,
    keyOf,
    (movement) => -(signs.get(movement) ?? 1) * valueInDisplay(converter, movement),
  );
}
