import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useLatestStatement } from '@/features/accounts';
import {
  accountName,
  addMovement,
  categoryOptions,
  counterparty,
  deleteMovements,
  linkToAsset,
  markMovements,
  setCategory,
  useAssets,
  useLedger,
  useLedgerNames,
  type LedgerMovement,
} from '@/features/ledger';

import type { Transaction, TransactionCategory, TransactionsData } from '../types';

/*
 * Transactions are the movements of domfin-api's ledger: their categories,
 * what's marked reviewed or hidden and what's added by hand all go back to
 * it, and every screen counts them alike.
 */

export type NewTransaction = Pick<
  Transaction,
  'date' | 'merchant' | 'amount' | 'currency' | 'accountId' | 'kind' | 'categoryId'
> &
  Pick<Partial<Transaction>, 'notes'>;

/** Adds a transaction by hand, in cents of its account's currency. */
function add(input: NewTransaction) {
  return addMovement({
    accountId: input.accountId,
    date: input.date,
    description: input.merchant,
    amount: Math.round(input.amount * 100),
    categoryId: input.categoryId,
    notes: input.notes,
  });
}

const fromLedger = (
  movement: LedgerMovement,
  assetNames: ReadonlyMap<string, string>,
  cashAccounts: ReadonlySet<string>,
  language: string,
): Transaction => ({
  id: movement.id,
  date: movement.date,
  merchant: counterparty(movement, language),
  amount: movement.amount / 100,
  currency: movement.currency,
  amounts:
    movement.amounts &&
    (Object.fromEntries(
      Object.entries(movement.amounts).map(([currency, cents]) => [currency, cents / 100]),
    ) as Transaction['amounts']),
  accountId: movement.accountId,
  kind: movement.flow,
  categoryId: movement.categoryId,
  tags: [],
  notes: movement.notes,
  needsReview: movement.review,
  hidden: movement.hidden ?? false,
  assetName: movement.assetId ? assetNames.get(movement.assetId) : undefined,
  corrected: movement.by === 'manual',
  manual: movement.manual,
  missing: movement.missing,
  undetailedCash: movement.kind === 'undetailed_cash',
  cash: cashAccounts.has(movement.accountId),
});

export function useTransactions(): { data: TransactionsData; isLoading: boolean } {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const ledger = useLedger();
  const names = useLedgerNames(ledger);
  const latestStatement = useLatestStatement();
  const { assets } = useAssets();
  const assetNames = useMemo(() => new Map(assets.map((asset) => [asset.id, asset.name])), [assets]);
  const assetChoices = useMemo(() => assets.map((asset) => ({ value: asset.id, label: asset.name })), [assets]);

  const categories = useMemo(
    (): TransactionCategory[] =>
      ledger.categories
        .filter((category) => !category.archived)
        .map((category) => ({ id: category.id, label: names.category(category.id), kind: category.flow }))
        .sort((a, b) => a.label.localeCompare(b.label, language)),
    [ledger.categories, names, language],
  );

  const accounts = useMemo(
    () =>
      ledger.accounts.map((account) => ({
        id: account.id,
        name: accountName(account, ledger.accounts, t),
        currency: account.currency,
        kind: account.kind,
      })),
    [ledger.accounts, t],
  );

  // Newest first, the hidden ones among them for the Hidden filter.
  const transactions = useMemo(() => {
    const cash = new Set(ledger.accounts.filter((account) => account.kind === 'cash').map((account) => account.id));
    return [...ledger.movements, ...ledger.hidden]
      .map((movement) => fromLedger(movement, assetNames, cash, language))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [ledger.movements, ledger.hidden, ledger.accounts, assetNames, language]);

  const categoryChoices = useMemo(
    () => categoryOptions(ledger.categories, ledger.groups, names),
    [ledger.categories, ledger.groups, names],
  );

  const data = useMemo(
    () => ({ transactions, accounts, categories, categoryChoices, assetChoices, tags: [], latestStatement }),
    [transactions, accounts, categories, categoryChoices, assetChoices, latestStatement],
  );
  return { data, isLoading: ledger.status === 'loading' };
}

export const transactionActions = {
  add,
  /** Files transactions under a category; `null` gives them back to the automatic classification. */
  categorize: setCategory,
  /** Links transactions to an investment, or unlinks them with `null`. */
  link: linkToAsset,
  markReviewed: (ids: readonly string[]) => markMovements(ids, { reviewed: true }),
  setHidden: (ids: readonly string[], hidden: boolean) => markMovements(ids, { hidden }),
  /** Only for the ones added by hand. */
  remove: deleteMovements,
};
