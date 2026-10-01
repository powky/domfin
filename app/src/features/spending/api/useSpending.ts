import { useMemo } from 'react';

import { useLatestStatement } from '@/features/accounts';
import { useConverter, valueInDisplay } from '@/features/currency';
import {
  UNCATEGORIZED,
  counterparty,
  groupColor,
  monthlyValues,
  useLedger,
  useLedgerNames,
  type LedgerMovement,
} from '@/features/ledger';
import { sumCents } from '@/lib/currency';
import { monthsInRange } from '@/lib/period';

import type { MonthRange, SpendingItem, SpendingSummary } from '../types';

const addMonthly = (a: number[], b: number[]) => a.map((value, index) => sumCents([value, b[index] ?? 0]));

/**
 * Spending for a month range, in the display currency: the ledger's
 * expenses, with refunds taking back from their category.
 */
export function useSpending(range: MonthRange): SpendingSummary {
  const converter = useConverter();
  const ledger = useLedger();
  const names = useLedgerNames(ledger);
  const latestStatement = useLatestStatement();
  return useMemo(() => {
    const months = monthsInRange(range);
    const expenses = ledger.movements.filter((movement) => movement.flow === 'expense');
    // Each expense at the rate of its date, so a closed month doesn't move with today's rate.
    const spent = (movement: LedgerMovement) => -valueInDisplay(converter, movement);
    const inDisplay = (keyOf: (movement: LedgerMovement) => string) => monthlyValues(expenses, months, keyOf, spent);
    const categoryOf = (movement: LedgerMovement) => movement.categoryId ?? UNCATEGORIZED;

    const categories = [...inDisplay(categoryOf)].map(([id, monthly]): SpendingItem => {
      const groupId = names.groupOf(id === UNCATEGORIZED ? null : id);
      return {
        id,
        label: names.category(id === UNCATEGORIZED ? null : id),
        context: id === UNCATEGORIZED ? undefined : names.group(groupId),
        amount: sumCents(monthly),
        share: 0,
        color: groupColor(groupId),
        monthly,
      };
    });

    const groupMonthly = new Map<string, number[]>();
    for (const category of categories) {
      const groupId = names.groupOf(category.id === UNCATEGORIZED ? null : category.id);
      groupMonthly.set(groupId, addMonthly(groupMonthly.get(groupId) ?? months.map(() => 0), category.monthly));
    }
    const groups = [...groupMonthly].map(
      ([id, monthly]): SpendingItem => ({
        id,
        label: names.group(id),
        amount: sumCents(monthly),
        share: 0,
        color: groupColor(id),
        monthly,
      }),
    );

    // Each merchant takes the category of its latest expense.
    const merchantCategory = new Map<string, string>();
    for (const movement of expenses) {
      const merchant = counterparty(movement);
      if (!merchantCategory.has(merchant)) merchantCategory.set(merchant, categoryOf(movement));
    }
    const merchants = [...inDisplay(counterparty)].map(([merchant, monthly]): SpendingItem => {
      const categoryId = merchantCategory.get(merchant) ?? UNCATEGORIZED;
      const known = categoryId === UNCATEGORIZED ? null : categoryId;
      return {
        id: `merchant:${merchant}`,
        label: merchant,
        context: names.category(known),
        amount: sumCents(monthly),
        share: 0,
        color: groupColor(names.groupOf(known)),
        monthly,
      };
    });

    const total = sumCents(categories.map((category) => category.amount));
    const withShare = (items: SpendingItem[]) =>
      items
        .map((item) => ({ ...item, share: total > 0 ? item.amount / total : 0 }))
        .filter((item) => item.amount > 0)
        .sort((a, b) => b.amount - a.amount);
    const sortedGroups = withShare(groups);
    const inMonths = new Set(months);

    return {
      months,
      total,
      averagePerMonth: months.length ? Math.round((total / months.length) * 100) / 100 : 0,
      largestGroup: sortedGroups[0] ?? null,
      transactions: expenses.filter((movement) => inMonths.has(movement.date.slice(0, 7))).length,
      groups: sortedGroups,
      categories: withShare(categories),
      merchants: withShare(merchants),
      latestStatement,
      status: ledger.status,
    };
  }, [range, ledger.movements, ledger.status, names, converter, latestStatement]);
}
