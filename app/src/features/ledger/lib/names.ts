import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { categoryLabel, groupLabel } from '@/i18n';
import type { ChartColor } from '@/theme';

import type { LedgerCategory, LedgerGroup, LedgerMovement, LedgerState } from '../types';

/** Stands for "no category" wherever an id is needed (a chart item, a filter). */
export const UNCATEGORIZED = 'uncategorized';

/** Chart color of each built-in expense group; the rest share a light gray. */
const groupColors: Readonly<Record<string, ChartColor>> = {
  work: 'income',
  returns: 'income',
  'other-income': 'income',
  food: 'amber',
  transport: 'pink',
  home: 'teal',
  health: 'red',
  shopping: 'blue',
  lifestyle: 'purple',
  travel: 'sky',
  education: 'olive',
  finance: 'navy',
  taxes: 'brown',
  'other-expenses': 'orange',
};

// Your own groups take one of these, always the same one for each.
const spareColors: readonly ChartColor[] = ['indigo', 'plum', 'magenta', 'gold'];

/**
 * A group's color in charts: Domfin's own have theirs, yours one of the
 * spares by their ID; Uncategorized stays gray, as something to review.
 */
export function groupColor(groupId: string): ChartColor {
  if (groupId === UNCATEGORIZED) return 'slateLight';
  const own = groupColors[groupId];
  if (own) return own;
  const code = [...groupId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return spareColors[code % spareColors.length] ?? 'slateLight';
}

/** Who the money went to or came from: the card's merchant, or what the bank printed. */
export const counterparty = (movement: Pick<LedgerMovement, 'merchant' | 'description'>) =>
  movement.merchant || movement.description;

export type LedgerNames = {
  /** Name of a category in the app language; "Uncategorized" for null. */
  category: (id: string | null) => string;
  group: (id: string) => string;
  /** The category's group id, or `UNCATEGORIZED`. */
  groupOf: (categoryId: string | null) => string;
  categories: ReadonlyMap<string, LedgerCategory>;
  groups: ReadonlyMap<string, LedgerGroup>;
};

/** Names of the ledger's categories and groups in the app language, rebuilt when it changes. */
export function useLedgerNames({ categories, groups }: Pick<LedgerState, 'categories' | 'groups'>): LedgerNames {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  return useMemo(() => {
    const byId = new Map(categories.map((category) => [category.id, category]));
    const groupById = new Map(groups.map((group) => [group.id, group]));
    return {
      category: (id) => {
        if (!id) return t('categories.uncategorized');
        return categoryLabel(id, byId.get(id)?.name ?? id, language);
      },
      group: (id) => {
        if (id === UNCATEGORIZED) return t('categories.uncategorized');
        return groupLabel(id, groupById.get(id)?.name ?? id, language);
      },
      groupOf: (categoryId) => (categoryId && byId.get(categoryId)?.group) || UNCATEGORIZED,
      categories: byId,
      groups: groupById,
    };
  }, [categories, groups, language, t]);
}
