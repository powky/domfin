import type { AccountSummary, AccountType } from '../types';

/** Display order of account types: assets first, then liabilities. */
export const ACCOUNT_TYPE_ORDER: AccountType[] = [
  'cash',
  'investment',
  'retirement',
  'real-estate',
  'vehicle',
  'credit-card',
  'loan',
];

/**
 * Whether a balance change is good news: more money for assets, less owed
 * for liabilities. Null when nothing changed.
 */
export function isFavorable(account: Pick<AccountSummary, 'class' | 'change'>) {
  if (Math.abs(account.change) < 0.005) return null;
  return account.class === 'asset' ? account.change > 0 : account.change < 0;
}

/** "Banco Popular ••4821". */
export const institutionLine = (account: Pick<AccountSummary, 'institution' | 'mask'>) =>
  account.mask ? `${account.institution.name} ••${account.mask}` : account.institution.name;
