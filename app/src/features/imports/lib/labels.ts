import { i18n } from '@/i18n';
import { currencySymbols } from '@/lib/currency';

import type { StatementAccount, StatementSection } from '../types';

/**
 * "Contigo ****1234" for a card or bank account; "Loan ****5678" or
 * "Certificate ****9012" for loans and certificates, whose histories print no name.
 */
export function accountLabel(account: StatementAccount) {
  if (account.kind === 'certificate') return i18n.t('imports.certificateName', { last4: account.last4 });
  if (account.kind === 'loan' || !account.name) return i18n.t('imports.loanName', { last4: account.last4 });
  return `${account.name} ****${account.last4}`;
}

/** "60 transactions in RD$", one per currency. */
export function sectionLabels(sections: StatementSection[] = []) {
  return sections.map((section) =>
    i18n.t('imports.transactions', { count: section.transactions, currency: currencySymbols[section.currency] }),
  );
}
