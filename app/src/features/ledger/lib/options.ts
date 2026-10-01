import type { LedgerCategory, LedgerGroup } from '../types';
import type { LedgerNames } from './names';

const flowOrder = { income: 0, expense: 1, transfer: 2 };

/**
 * The categories that aren't archived (and that `keep` keeps), to pick one:
 * income first, then expenses and transfers, each group in its order, named
 * "Category · Group".
 */
export function categoryOptions(
  categories: readonly LedgerCategory[],
  groups: readonly LedgerGroup[],
  names: LedgerNames,
  keep: (category: LedgerCategory) => boolean = () => true,
): { value: string; label: string }[] {
  const groupOrder = new Map(groups.map((group, index) => [group.id, index]));
  return categories
    .map((category, index) => ({ category, index }))
    .filter(({ category }) => !category.archived && keep(category))
    .sort(
      (a, b) =>
        flowOrder[a.category.flow] - flowOrder[b.category.flow] ||
        (groupOrder.get(a.category.group) ?? 0) - (groupOrder.get(b.category.group) ?? 0) ||
        a.index - b.index,
    )
    .map(({ category }) => ({
      value: category.id,
      label: `${names.category(category.id)} · ${names.group(category.group)}`,
    }));
}
