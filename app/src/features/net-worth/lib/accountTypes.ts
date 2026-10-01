import type { AccountClass, AccountType } from '@/features/accounts';
import type { ChartColor } from '@/theme';

/** Chart color of each type; their names are the `accountTypes` translations. */
export const accountTypes: Record<AccountType, { color: ChartColor }> = {
  cash: { color: 'savings' },
  investment: { color: 'darkGreen' },
  retirement: { color: 'purple' },
  'real-estate': { color: 'amber' },
  vehicle: { color: 'teal' },
  loan: { color: 'pink' },
  'credit-card': { color: 'red' },
};

/** Order of the types in each list. */
export const typeOrder: Record<AccountClass, AccountType[]> = {
  asset: ['cash', 'investment', 'retirement', 'real-estate', 'vehicle'],
  liability: ['loan', 'credit-card'],
};
