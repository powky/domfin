import type { ChartColor } from '@/theme';

import type { SelectedAccount } from '../types';

/** Colors handed out to accounts picked from the lists, in order. */
export const selectionColors: ChartColor[] = ['blue', 'amber', 'darkGreen', 'pink', 'purple', 'red', 'teal', 'sky', 'orange', 'magenta'];

/** Adds or removes an account. New picks get the first color not in use. */
export function toggleSelection(selected: SelectedAccount[], id: string): SelectedAccount[] {
  if (selected.some((item) => item.id === id)) return selected.filter((item) => item.id !== id);
  const used = new Set(selected.map((item) => item.color));
  const color =
    selectionColors.find((candidate) => !used.has(candidate)) ?? selectionColors[selected.length % selectionColors.length];
  return [...selected, { id, color }];
}
