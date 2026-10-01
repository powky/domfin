import type { TFunction } from 'i18next';

import { currencySymbols } from '@/lib/currency';

import type { LedgerAccount } from '../types';

type Named = Pick<LedgerAccount, 'institution' | 'name' | 'last4' | 'currency'> & { kind: string; id?: string };

/**
 * The name to show: the product for bank accounts and cards ("Contigo", with
 * its currency when the card is billed in two), a generic one for loans and
 * certificates, whose statements don't name them.
 */
export function accountName(account: Named, all: readonly Named[], t: TFunction) {
  // Assets and debts outside a bank keep the name they were given.
  if (account.id?.startsWith('asset:')) return account.name;
  if (account.kind === 'loan') return t('accounts.live.loan');
  if (account.kind === 'certificate') return t('accounts.live.certificate');
  // Accounts with the same number are one card billed in two currencies.
  const sameCard = all.filter(
    (other) =>
      account.last4 !== '' &&
      other.kind === account.kind &&
      other.institution === account.institution &&
      other.last4 === account.last4,
  );
  return sameCard.length > 1 ? `${account.name} ${currencySymbols[account.currency]}` : account.name;
}
