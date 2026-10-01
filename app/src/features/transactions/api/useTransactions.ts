import { useMemo, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { useLatestStatement } from '@/features/accounts';
import {
  accountName,
  categoryOptions,
  counterparty,
  linkToAsset,
  setCategory,
  useAssets,
  useLedger,
  useLedgerNames,
  type LedgerMovement,
} from '@/features/ledger';

import type { Transaction, TransactionCategory, TransactionsData } from '../types';

/*
 * Transactions are the movements of domfin-api's ledger, and their
 * categories go back to it. Marking them reviewed, hiding them and adding
 * one by hand stay on this device for the session: the API doesn't store
 * those yet.
 */
type Patch = Partial<Pick<Transaction, 'needsReview' | 'hidden' | 'categoryId'>>;

type Edits = {
  patches: ReadonlyMap<string, Patch>;
  /** Added by hand, newest first. */
  manual: readonly Transaction[];
};

let edits: Edits = { patches: new Map(), manual: [] };
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getSnapshot = () => edits;

function set(next: Edits) {
  edits = next;
  listeners.forEach((listener) => listener());
}

function update(ids: readonly string[], patch: Patch) {
  const patches = new Map(edits.patches);
  for (const id of ids) patches.set(id, { ...patches.get(id), ...patch });
  set({ ...edits, patches });
}

export type NewTransaction = Pick<
  Transaction,
  'date' | 'merchant' | 'amount' | 'currency' | 'accountId' | 'kind' | 'categoryId'
> &
  Pick<Partial<Transaction>, 'notes'>;

let manualCount = 0;
const isManual = (id: string) => id.startsWith('manual-');

/**
 * Files transactions under a category (`null` gives them back to the
 * automatic classification). Imported ones keep it in domfin-api; ones
 * added by hand, for the session.
 */
async function categorize(ids: readonly string[], categoryId: string | null) {
  const manual = ids.filter(isManual);
  if (manual.length > 0 && categoryId !== null) update(manual, { categoryId });
  const imported = ids.filter((id) => !isManual(id));
  if (imported.length > 0) await setCategory(imported, categoryId);
}

function add(input: NewTransaction) {
  manualCount += 1;
  const transaction: Transaction = { id: `manual-${manualCount}`, tags: [], needsReview: false, hidden: false, ...input };
  set({ ...edits, manual: [transaction, ...edits.manual] });
}

/** Links transactions to an investment, or unlinks them with `null`; ones added by hand can't be. */
async function link(ids: readonly string[], assetId: string | null) {
  const imported = ids.filter((id) => !isManual(id));
  if (imported.length > 0) await linkToAsset(imported, assetId);
}

const fromLedger = (movement: LedgerMovement, assetNames: ReadonlyMap<string, string>): Transaction => ({
  id: movement.id,
  date: movement.date,
  merchant: counterparty(movement),
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
  needsReview: movement.review,
  hidden: false,
  assetName: movement.assetId ? assetNames.get(movement.assetId) : undefined,
  corrected: movement.by === 'manual',
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
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

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

  const transactions = useMemo(() => {
    const imported = ledger.movements.map((movement) => {
      const transaction = fromLedger(movement, assetNames);
      const patch = current.patches.get(transaction.id);
      return patch ? { ...transaction, ...patch } : transaction;
    });
    // Newest first: one added by hand goes before the others of its day.
    const all = [...current.manual.map((item) => ({ ...item, ...current.patches.get(item.id) })), ...imported];
    return all.sort((a, b) => b.date.localeCompare(a.date));
  }, [ledger.movements, current, assetNames]);

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
  categorize,
  link,
  markReviewed: (ids: readonly string[]) => update(ids, { needsReview: false }),
  setHidden: (ids: readonly string[], hidden: boolean) => update(ids, { hidden }),
};
