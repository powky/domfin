/*
 * What stands in a transaction's circle for who it's with: a known
 * merchant's logo (bundled with the app, see merchantLogos); for what no
 * company is behind, an icon of what it is (one of the bank's operations, a
 * person, cash nobody detailed); and anything else's initial.
 */

export type AvatarIcon =
  | 'payroll'
  | 'interest'
  | 'tax'
  | 'atm'
  | 'cashAdvance'
  | 'loan'
  | 'installment'
  | 'card'
  | 'deposit'
  | 'withdrawal'
  | 'cashback'
  | 'correction'
  | 'returned'
  | 'dollars'
  | 'account'
  | 'person'
  | 'cash';

export type AvatarLook = { logo: string } | { icon: AvatarIcon } | { initial: true };

/** What domfin-api says of who a transaction is with (see LedgerMovement). */
export type AvatarSubject = {
  merchantId?: string;
  operation?: string;
  person?: boolean;
  undetailedCash?: boolean;
};

/** The bank's own operations, by domfin-api's id for them, and their icon. */
const operationIcons: Readonly<Record<string, AvatarIcon>> = {
  payroll: 'payroll',
  interest: 'interest',
  withholding: 'tax',
  atm: 'atm',
  'cash-advance': 'cashAdvance',
  loan: 'loan',
  installment: 'installment',
  payment: 'card',
  deposit: 'deposit',
  withdrawal: 'withdrawal',
  cashback: 'cashback',
  correction: 'correction',
  returned: 'returned',
  'dollars-in': 'dollars',
  card: 'card',
  account: 'account',
};

/** How to draw who a transaction is with, given which merchants have a logo. */
export function avatarLook(subject: AvatarSubject, hasLogo: (merchantId: string) => boolean): AvatarLook {
  if (subject.merchantId && hasLogo(subject.merchantId)) return { logo: subject.merchantId };
  if (subject.undetailedCash) return { icon: 'cash' };
  if (subject.operation) return { icon: operationIcons[subject.operation] ?? 'account' };
  if (subject.person) return { icon: 'person' };
  return { initial: true };
}
