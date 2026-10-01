import type { LedgerAccount, LedgerCategory } from '../types';

// Transfers by the way the money goes, seen from a checking or savings account.
const bankIn = new Set([
  'own-transfer',
  'currency-exchange',
  'cash-deposit',
  'cash-advance',
  'disbursement',
  'investment-out',
  'reversal',
]);
const bankOut = new Set([
  'own-transfer',
  'currency-exchange',
  'cash-withdrawal',
  'card-payment',
  'loan-payment',
  'investment-in',
  'reversal',
]);
// And from a card: its payments and returns come in, cash goes out.
const cardIn = new Set(['card-payment', 'reversal']);
const cardOut = new Set(['cash-advance', 'cash-withdrawal']);

/**
 * Whether a category makes sense for a movement: money coming into an
 * account is income or a transfer in, never a withdrawal; money going out
 * is an expense or a transfer out. On a card, what comes in is a payment,
 * a refund (an expense that lowers spending) or cashback.
 */
export function fits(
  category: Pick<LedgerCategory, 'id' | 'flow'>,
  amount: number,
  kind: LedgerAccount['kind'] | undefined,
): boolean {
  const incoming = amount > 0;
  if (kind === 'credit_card') {
    if (category.flow === 'transfer') return (incoming ? cardIn : cardOut).has(category.id);
    return incoming || category.flow === 'expense';
  }
  if (kind === 'savings' || kind === 'checking') {
    if (category.flow === 'transfer') return (incoming ? bankIn : bankOut).has(category.id);
    return category.flow === (incoming ? 'income' : 'expense');
  }
  // Loans, certificates and assets: anything goes.
  return true;
}
